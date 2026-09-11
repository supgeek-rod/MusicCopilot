<?php

namespace App\Http\Controllers;

use App\Jobs\DownloadSongJob;
use App\Jobs\ExpandArtistAlbumJob;
use App\Services\DownloadTaskService;
use App\Plugins\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

/**
 * 下载任务创建：/api/download/downloadSong|downloadAlbum|downloadArtistAlbum
 * 契约对齐 SQMusic：入参为前端搜索/详情记录原样回传（单曲带 brType，整张/歌手带 bit 整数码率）。
 */
class DownloadController extends Controller
{
    public function __construct(
        private readonly SourceManager $sources,
        private readonly DownloadTaskService $tasks,
    ) {
    }

    /**
     * 单曲下载：body 为搜索返回的完整歌曲记录，brType 省略时 worker 自动选最高音质
     *
     * @response status=200 {"code":200,"msg":null,"data":null}
     */
    public function downloadSong(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'required|string',
            'name' => 'required|string',
            'plugName' => 'required|string',
            'brType' => 'nullable|string',
        ]);

        $plugName = $validated['plugName'];
        if (! $this->sources->has($plugName)) {
            return $this->fail("插件 {$plugName} 未开启");
        }

        $task = $this->tasks->createTaskFromSong($plugName, $request->all(), (string) ($validated['brType'] ?? ''));
        if ($task === null) {
            return $this->fail('歌曲记录缺少 id/name');
        }

        DownloadSongJob::dispatch($task->id);

        return response()->json(['code' => 200, 'msg' => null, 'data' => null]);
    }

    /**
     * 整张专辑下载：body 为专辑记录 + 可选 bit（整数码率，省略=自动最高）。
     * 同步展开曲目（一次上游请求）并返回任务数组，前端取数组长度做计数提示
     *
     * @response status=200 {"code":200,"msg":null,"data":[{"id":1,"downloadMusicname":"晴天","downloadStatus":"waiting"}]}
     */
    public function downloadAlbum(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'albumid' => 'required|string',
            'plugName' => 'required|string',
            'bit' => 'nullable|integer',
        ]);

        $plugName = $validated['plugName'];
        if (! $this->sources->has($plugName)) {
            return $this->fail("插件 {$plugName} 未开启");
        }

        try {
            $brType = $this->resolveBit($plugName, $validated['bit'] ?? null);
            $created = $this->tasks->expandAlbum($plugName, $validated['albumid'], $brType);
        } catch (Throwable $e) {
            report($e);

            return $this->fail('专辑下载任务创建失败：'.$e->getMessage());
        }

        return response()->json(['code' => 200, 'msg' => null, 'data' => $created]);
    }

    /**
     * 歌手全部专辑下载：专辑多（每张一次上游请求），入队异步展开，任务在 task/list 中渐进出现
     *
     * @response status=200 {"code":200,"msg":null,"data":null}
     */
    public function downloadArtistAlbum(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'artistid' => 'required|string',
            'plugName' => 'required|string',
            'bit' => 'nullable|integer',
        ]);

        $plugName = $validated['plugName'];
        if (! $this->sources->has($plugName)) {
            return $this->fail("插件 {$plugName} 未开启");
        }

        try {
            $brType = $this->resolveBit($plugName, $validated['bit'] ?? null);
        } catch (RuntimeException $e) {
            return $this->fail($e->getMessage());
        }

        ExpandArtistAlbumJob::dispatch($plugName, $validated['artistid'], $brType);

        return response()->json(['code' => 200, 'msg' => null, 'data' => null]);
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

    private function fail(string $msg): JsonResponse
    {
        return response()->json([
            'code' => 500,
            'msg' => $msg,
            'data' => null,
        ]);
    }
}
