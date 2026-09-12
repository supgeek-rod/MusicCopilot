<?php

namespace App\Http\Controllers;

use App\Models\DownloadTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * 容器间内部端点（scraper → server）：下载文件目录重排后的路径回写。
 * 不走 sqmusic 鉴权（scraper 无登录态），仅应在 compose 内网暴露；
 * 载荷严格校验，路径只存相对音乐目录的路径。
 */
class InternalController extends Controller
{
    /**
     * 回写下载任务的新路径
     *
     * @response status=200 {"code":200,"msg":null,"data":null}
     */
    public function updateDownloadTaskPath(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'taskId' => 'required|integer|min:1',
            // 相对音乐目录的 posix 路径，禁止绝对路径与穿越
            'path' => 'required|string|max:512',
        ]);

        $path = str_replace('\\', '/', $validated['path']);
        if (str_contains($path, '..') || str_starts_with($path, '/')) {
            return response()->json(['code' => 500, 'msg' => 'path 非法', 'data' => null]);
        }

        $task = DownloadTask::query()->find($validated['taskId']);
        if ($task === null) {
            return response()->json(['code' => 500, 'msg' => '任务不存在', 'data' => null]);
        }

        $task->forceFill(['file_path' => $path, 'update_time' => now()])->save();

        return response()->json(['code' => 200, 'msg' => null, 'data' => null]);
    }
}
