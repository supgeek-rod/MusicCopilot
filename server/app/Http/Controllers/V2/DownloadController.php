<?php

namespace App\Http\Controllers\V2;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\V2\TaskListResource;
use App\Http\Resources\V2\TaskPageResource;
use App\Http\Resources\V2\TaskResource;
use App\Jobs\DownloadSongJob;
use App\Jobs\ExpandArtistAlbumJob;
use App\Models\DownloadTask;
use App\Services\DownloadTaskService;
use App\Plugins\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use RuntimeException;
use Throwable;

/**
 * API V2 下载任务：/api/v2/downloads（REST 化）。
 * 创建走三个子资源端点（songs/albums/artists/{id}），任务操作收敛在
 * /downloads/{id} 与批量动作；批量删除经 DELETE /downloads?status=...
 * ⚠️ status=success 的批量删除 = 清空全部成功记录（不删落盘文件），前端有确认弹窗。
 */
class DownloadController extends Controller
{
    /** 允许批量删除的状态（进行中的 loading/downloading 不在列） */
    private const BATCH_DELETABLE_STATUSES = ['waiting', 'success', 'error'];

    public function __construct(
        private readonly SourceManager $sources,
        private readonly DownloadTaskService $tasks,
    ) {
    }

    /** 任务列表（分页 + 可选状态筛选） */
    public function index(Request $request): TaskPageResource
    {
        $validated = $request->validate([
            'page' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:200',
            'status' => 'nullable|string|in:waiting,loading,downloading,success,error',
        ]);

        $page = (int) ($validated['page'] ?? 1);
        $pageSize = (int) ($validated['pageSize'] ?? 20);

        $query = DownloadTask::query()->orderByDesc('id');
        if (($validated['status'] ?? '') !== '') {
            $query->where('status', $validated['status']);
        }
        $total = (clone $query)->count();

        return new TaskPageResource([
            'items' => $query->forPage($page, $pageSize)->get()->all(),
            'total' => $total,
            'page' => $page,
            'pageSize' => $pageSize,
        ]);
    }

    /** 单曲下载创建：body 为 V2 统一 Song 对象，brType 省略时 worker 自动选最高音质 */
    public function storeSong(Request $request): TaskListResource
    {
        $validated = $request->validate([
            'id' => 'required|integer',
            'name' => 'required|string',
            'plugName' => 'required|string',
            'brType' => 'nullable|string',
        ]);

        $this->assertPluginEnabled($validated['plugName']);

        $task = $this->tasks->createTaskFromSong(
            $validated['plugName'],
            $request->all(),
            (string) ($validated['brType'] ?? ''),
        );
        if ($task === null) {
            throw ApiException::badRequest('歌曲记录缺少 id/name');
        }

        DownloadSongJob::dispatch($task->id);

        return new TaskListResource(['tasks' => [$task]]);
    }

    /** 整张专辑下载创建：同步展开曲目（一次上游请求），返回任务数组 */
    public function storeAlbum(Request $request): TaskListResource
    {
        $validated = $request->validate([
            'id' => 'required|integer',
            'plugName' => 'required|string',
            'bit' => 'nullable|integer',
        ]);

        $this->assertPluginEnabled($validated['plugName']);

        // bit 反查属客户端参数错误（400），须在 upstream try 外抛出
        try {
            $brType = $this->resolveBit($validated['plugName'], $validated['bit'] ?? null);
        } catch (RuntimeException $e) {
            throw ApiException::badRequest($e->getMessage());
        }

        try {
            $created = $this->tasks->expandAlbum($validated['plugName'], (string) $validated['id'], $brType);
        } catch (Throwable $e) {
            report($e);

            throw ApiException::upstream('专辑下载任务创建失败：'.self::errorDetail($e));
        }

        return new TaskListResource(['tasks' => $created]);
    }

    /** 歌手全部专辑下载创建：专辑多（每张一次上游请求），入队异步展开（202） */
    public function storeArtist(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'plugName' => 'required|string',
            'bit' => 'nullable|integer',
        ]);

        $this->assertPluginEnabled($validated['plugName']);

        try {
            $brType = $this->resolveBit($validated['plugName'], $validated['bit'] ?? null);
        } catch (RuntimeException $e) {
            throw ApiException::badRequest($e->getMessage());
        }

        ExpandArtistAlbumJob::dispatch($validated['plugName'], $id, $brType);

        return response()->json(['queued' => true], 202);
    }

    /** 删除单个任务记录（不删已落盘文件；幂等） */
    public function destroy(string $id): Response
    {
        DownloadTask::query()->whereKey((int) $id)->delete();

        return response()->noContent();
    }

    /** 批量删除某状态的全部任务记录（status=success ⚠️ 清空全部成功记录） */
    public function destroyByStatus(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|string|in:'.implode(',', self::BATCH_DELETABLE_STATUSES),
        ]);

        $count = DownloadTask::query()->where('status', $validated['status'])->delete();

        return response()->json(['deleted' => (int) $count]);
    }

    /** 重新入队：等待/解析/传输中卡住的任务重新排队（成功/失败走专门动作） */
    public function refresh(string $id): TaskResource
    {
        $task = DownloadTask::query()->find((int) $id);
        if ($task === null) {
            throw ApiException::notFound('任务不存在');
        }
        if ($task->status === DownloadTask::STATUS_SUCCESS) {
            throw ApiException::badRequest('已完成的任务无需重新入队');
        }
        if ($task->status === DownloadTask::STATUS_ERROR) {
            throw ApiException::badRequest('失败任务请使用重试');
        }

        return $this->requeue($task);
    }

    /** 重试失败任务 */
    public function retry(string $id): TaskResource
    {
        $task = DownloadTask::query()->find((int) $id);
        if ($task === null) {
            throw ApiException::notFound('任务不存在');
        }
        if ($task->status !== DownloadTask::STATUS_ERROR) {
            throw ApiException::badRequest('仅失败任务可重试');
        }

        return $this->requeue($task);
    }

    /** 全部失败任务重试 */
    public function retryAll(): JsonResponse
    {
        $count = 0;
        DownloadTask::query()->where('status', DownloadTask::STATUS_ERROR)
            ->each(function (DownloadTask $task) use (&$count): void {
                $task->markStatus(DownloadTask::STATUS_WAITING);
                DownloadSongJob::dispatch($task->id);
                $count++;
            });

        return response()->json(['retried' => $count]);
    }

    private function requeue(DownloadTask $task): TaskResource
    {
        $task->markStatus(DownloadTask::STATUS_WAITING);
        DownloadSongJob::dispatch($task->id);

        return new TaskResource($task);
    }

    private function assertPluginEnabled(string $plugName): void
    {
        if (! $this->sources->has($plugName)) {
            throw ApiException::notFound("音源插件 {$plugName} 未开启");
        }
    }

    /** bit 整数码率 → KW_* 别名（插件枚举反查）；null = 默认音质（空串让 worker 自动选最高） */
    private function resolveBit(string $plugName, ?int $bit): string
    {
        if ($bit === null) {
            return '';
        }

        foreach ($this->sources->get($plugName)->brTypeList() as $item) {
            if ($item['bit'] === $bit) {
                return $item['id'];
            }
        }

        throw new RuntimeException("不支持的音质码率 bit={$bit}");
    }
}
