<?php

namespace App\Http\Controllers;

use App\Jobs\DownloadSongJob;
use App\Models\DownloadTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * 下载任务管理：/api/task/*（契约对齐 SQMusic，MyBatis-Plus 风格分页）。
 * 注意 delSuccessTask 在 SQMusic 语义里是清空全部成功记录（根 AGENTS.md 警示），照契约保留。
 */
class TaskController extends Controller
{
    /**
     * 任务列表（分页 + 状态筛选；另接受 SQMusic 契约中的其余筛选字段但仅实现状态筛选）
     *
     * @response status=200 {"code":200,"msg":null,"data":{"records":[{"id":1,"downloadMusicname":"晴天","downloadStatus":"success"}],"total":1,"size":20,"current":1,"pages":1}}
     */
    public function list(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pageIndex' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:200',
            'downloadStatus' => 'nullable|string',
        ]);

        $pageIndex = (int) ($validated['pageIndex'] ?? 1);
        $pageSize = (int) ($validated['pageSize'] ?? 20);

        $query = DownloadTask::query()->orderByDesc('id');
        $status = (string) ($validated['downloadStatus'] ?? '');
        if ($status !== '') {
            $query->where('status', $status);
        }

        $total = (clone $query)->count();
        $records = $query->forPage($pageIndex, $pageSize)->get()->map->toContract()->all();

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => [
                'records' => $records,
                'total' => $total,
                'size' => $pageSize,
                'current' => $pageIndex,
                'pages' => (int) ceil($total / $pageSize),
            ],
        ]);
    }

    /** 删除单个任务记录（不删已落盘文件） */
    public function del(Request $request): JsonResponse
    {
        $validated = $request->validate(['id' => 'required']);

        DownloadTask::query()->whereKey((int) $validated['id'])->delete();

        return $this->ok();
    }

    /** 重新入队：等待/解析/传输中卡住的任务重新排队（成功/失败走专门端点） */
    public function refreshTask(Request $request): JsonResponse
    {
        $validated = $request->validate(['id' => 'required']);

        $task = DownloadTask::query()->find((int) $validated['id']);
        if ($task === null) {
            return $this->fail('任务不存在');
        }
        if ($task->status === DownloadTask::STATUS_SUCCESS) {
            return $this->fail('已完成的任务无需重新入队');
        }
        if ($task->status === DownloadTask::STATUS_ERROR) {
            return $this->fail('失败任务请使用重试');
        }

        return $this->requeue($task);
    }

    /** 重试失败任务 */
    public function errorTaskRetry(Request $request): JsonResponse
    {
        $validated = $request->validate(['id' => 'required']);

        $task = DownloadTask::query()->find((int) $validated['id']);
        if ($task === null) {
            return $this->fail('任务不存在');
        }
        if ($task->status !== DownloadTask::STATUS_ERROR) {
            return $this->fail('仅失败任务可重试');
        }

        return $this->requeue($task);
    }

    /** 全部失败任务重试 */
    public function againTask(): JsonResponse
    {
        $count = 0;
        DownloadTask::query()->where('status', DownloadTask::STATUS_ERROR)
            ->each(function (DownloadTask $task) use (&$count): void {
                $task->markStatus(DownloadTask::STATUS_WAITING);
                DownloadSongJob::dispatch($task->id);
                $count++;
            });

        return $this->ok();
    }

    public function delErrorTask(): JsonResponse
    {
        return $this->deleteByStatus(DownloadTask::STATUS_ERROR);
    }

    /** ⚠️ 清空全部成功任务记录（不删落盘文件；SQMusic 契约语义，前端有确认弹窗） */
    public function delSuccessTask(): JsonResponse
    {
        return $this->deleteByStatus(DownloadTask::STATUS_SUCCESS);
    }

    public function delWaitingTask(): JsonResponse
    {
        return $this->deleteByStatus(DownloadTask::STATUS_WAITING);
    }

    private function requeue(DownloadTask $task): JsonResponse
    {
        $task->markStatus(DownloadTask::STATUS_WAITING);
        DownloadSongJob::dispatch($task->id);

        return $this->ok();
    }

    private function deleteByStatus(string $status): JsonResponse
    {
        $count = DownloadTask::query()->where('status', $status)->delete();

        return response()->json(['code' => 200, 'msg' => null, 'data' => ['count' => $count]]);
    }

    private function ok(): JsonResponse
    {
        return response()->json(['code' => 200, 'msg' => null, 'data' => null]);
    }

    private function fail(string $msg): JsonResponse
    {
        return response()->json(['code' => 500, 'msg' => $msg, 'data' => null]);
    }
}
