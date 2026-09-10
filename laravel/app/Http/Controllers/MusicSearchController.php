<?php

namespace App\Http\Controllers;

use App\Plugins\Sources\SourceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * 音乐搜索接口：/api/music/searchSong|searchArtist|searchAlbum
 * 响应契约对齐 SQMusic：{code, msg, data}，code=200 才算成功。
 */
class MusicSearchController extends Controller
{
    public function __construct(private readonly SourceManager $sources)
    {
    }

    public function searchSong(Request $request): JsonResponse
    {
        return $this->search($request, 'song');
    }

    public function searchArtist(Request $request): JsonResponse
    {
        return $this->search($request, 'artist');
    }

    public function searchAlbum(Request $request): JsonResponse
    {
        return $this->search($request, 'album');
    }

    private function search(Request $request, string $type): JsonResponse
    {
        $keyword = trim((string) $request->query('keyword', ''));
        $plugName = (string) ($request->query('plugName', 'kw'));
        $pageIndex = max(1, (int) $request->query('pageIndex', '1'));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', '30')));

        if ($keyword === '') {
            return $this->fail('keyword 不能为空');
        }

        if (! $this->sources->has($plugName)) {
            return $this->fail("插件 {$plugName} 未开启");
        }

        $plugin = $this->sources->get($plugName);

        try {
            $result = match ($type) {
                'song' => $plugin->searchSong($keyword, $pageIndex, $pageSize),
                'artist' => $plugin->searchArtist($keyword, $pageIndex, $pageSize),
                'album' => $plugin->searchAlbum($keyword, $pageIndex, $pageSize),
            };
        } catch (Throwable $e) {
            report($e);

            return $this->fail('音源请求失败：'.$e->getMessage());
        }

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => [
                'records' => $result['records'],
                'searchTotal' => $result['total'],
                'searchIndex' => $pageIndex,
                'searchSize' => $pageSize,
                'searchKeyWork' => $keyword,
                'plugName' => $plugName,
            ],
        ]);
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
