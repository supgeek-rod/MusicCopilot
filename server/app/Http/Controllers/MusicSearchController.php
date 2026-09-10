<?php

namespace App\Http\Controllers;

use App\Plugins\Sources\LyricPlugin;
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

    /**
     * 搜索单曲（酷我：search.kuwo.cn/r.s ft=music）
     *
     * @response status=200 {"code":200,"msg":null,"data":{"records":[{"id":"228908","name":"晴天","artistName":["周杰伦"],"albumName":"叶惠美","albumid":"1293","duration":"269000","brTypes":["KW_FLAC_2000","KW_MP3_320","KW_MP3_128"],"pic":"https://example.com/500/x.jpg","plugName":"kw"}],"searchTotal":6627,"searchIndex":1,"searchSize":3,"searchKeyWork":"晴天 周杰伦","plugName":"kw"}}
     */
    public function searchSong(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
            'pageIndex' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:100',
        ]);

        return $this->search($validated, 'song');
    }

    /**
     * 搜索歌手（酷我：r.s ft=artist）
     *
     * @response status=200 {"code": 200, "msg": null, "data": {"records": [{"artistName": "周杰伦", "artistid": "336", "pic": "https://img4.kuwo.cn/star/starheads/500/x.jpg", "plugName": "kw", "total": "45", "dataInfo": {}}], "searchTotal": 50, "searchIndex": 1, "searchSize": 3, "searchKeyWork": "周杰伦", "plugName": "kw"}}
     */
    public function searchArtist(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
            'pageIndex' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:100',
        ]);

        return $this->search($validated, 'artist');
    }

    /**
     * 搜索专辑（酷我：r.s ft=album）
     *
     * @response status=200 {"code": 200, "msg": null, "data": {"records": [{"albumName": "叶惠美", "albumid": "1293", "artistName": "周杰伦", "artistid": "336", "pic": "https://img3.kuwo.cn/star/albumcover/500/x.jpg", "plugName": "kw", "total": "11", "dataInfo": {}}], "searchTotal": 3, "searchIndex": 1, "searchSize": 3, "searchKeyWork": "叶惠美", "plugName": "kw"}}
     */
    public function searchAlbum(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
            'pageIndex' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:100',
        ]);

        return $this->search($validated, 'album');
    }

    /**
     * 歌词（酷我加密歌词接口 newlyric）
     * 契约对齐 SQMusic 的 POST /api/music/getLyric，但按「新端点不复制历史瑕疵」
     * 把 LRC 文本放 data（SQMusic 放 msg，前端 music.ts getLyric 两种均兼容）。
     *
     * @response status=200 {"code":200,"msg":null,"data":"[00:00.00]作词：周杰伦\n[00:01.00]故事的小黄花"}
     */
    public function getLyric(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => 'required|string',
            'plugName' => 'string',
        ]);

        $plugName = $validated['plugName'] ?? 'kw';

        if (! $this->sources->has($plugName)) {
            return $this->fail("插件 {$plugName} 未开启");
        }

        $plugin = $this->sources->get($plugName);

        if (! $plugin instanceof LyricPlugin) {
            return $this->fail("插件 {$plugName} 不支持歌词");
        }

        try {
            $lyric = $plugin->getLyric($validated['id']);
        } catch (Throwable $e) {
            report($e);

            return $this->fail('歌词获取失败：'.$e->getMessage());
        }

        if ($lyric === null || $lyric === '') {
            return $this->fail('未找到歌词');
        }

        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => $lyric,
        ]);
    }

    private function search(array $validated, string $type): JsonResponse
    {
        $keyword = trim($validated['keyword']);
        $plugName = $validated['plugName'] ?? 'kw';
        $pageIndex = $validated['pageIndex'] ?? 1;
        $pageSize = $validated['pageSize'] ?? 30;

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
