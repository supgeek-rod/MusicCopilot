<?php

namespace App\Http\Controllers\V2;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\V2\AlbumDetailResource;
use App\Http\Resources\V2\ArtistDetailResource;
use App\Http\Resources\V2\AlbumPageResource;
use App\Http\Resources\V2\ArtistPageResource;
use App\Http\Resources\V2\SongPageResource;
use App\Plugins\Sources\SourceManager;
use App\Plugins\Sources\SourcePlugin;
use Illuminate\Http\Request;
use Throwable;

/**
 * API V2 搜索与详情：/api/v2/search/{songs,artists,albums,tips}、
 * /api/v2/artists/{id}/albums、/api/v2/albums/{id}。
 * 错误契约：真 HTTP 状态码 + {error, message}（见 ApiException）。
 */
class SearchController extends Controller
{
    public function __construct(private readonly SourceManager $sources)
    {
    }

    /** 搜索单曲 */
    public function songs(Request $request): SongPageResource
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
            'page' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:100',
        ]);

        [$page, $pageSize] = $this->pageParams($validated, 30);
        $result = $this->runPlugin(
            $validated['plugName'] ?? 'kw',
            fn (SourcePlugin $p) => $p->searchSong($this->keyword($validated), $page, $pageSize),
        );

        return new SongPageResource([
            'items' => $result['records'],
            'total' => $result['total'],
            'page' => $page,
            'pageSize' => $pageSize,
        ]);
    }

    /** 搜索歌手 */
    public function artists(Request $request): ArtistPageResource
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
            'page' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:100',
        ]);

        [$page, $pageSize] = $this->pageParams($validated, 30);
        $result = $this->runPlugin(
            $validated['plugName'] ?? 'kw',
            fn (SourcePlugin $p) => $p->searchArtist($this->keyword($validated), $page, $pageSize),
        );

        return new ArtistPageResource([
            'items' => $result['records'],
            'total' => $result['total'],
            'page' => $page,
            'pageSize' => $pageSize,
        ]);
    }

    /** 搜索专辑 */
    public function albums(Request $request): AlbumPageResource
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
            'page' => 'integer|min:1',
            'pageSize' => 'integer|min:1|max:100',
        ]);

        [$page, $pageSize] = $this->pageParams($validated, 30);
        $result = $this->runPlugin(
            $validated['plugName'] ?? 'kw',
            fn (SourcePlugin $p) => $p->searchAlbum($this->keyword($validated), $page, $pageSize),
        );

        return new AlbumPageResource([
            'items' => $result['records'],
            'total' => $result['total'],
            'page' => $page,
            'pageSize' => $pageSize,
        ]);
    }

    /** 搜索联想词 */
    public function tips(Request $request)
    {
        $validated = $request->validate([
            'keyword' => 'required|string',
            'plugName' => 'string',
        ]);

        $tips = $this->runPlugin(
            $validated['plugName'] ?? 'kw',
            fn (SourcePlugin $p) => $p->searchTips(trim($validated['keyword'])),
        );

        return response()->json($tips);
    }

    /** 歌手详情 + 全部专辑 */
    public function artistAlbums(Request $request, string $id): ArtistDetailResource
    {
        $validated = $request->validate(['plugName' => 'string']);

        $data = $this->runPlugin(
            $validated['plugName'] ?? 'kw',
            fn (SourcePlugin $p) => $p->artistAlbum($id),
        );

        return new ArtistDetailResource($data);
    }

    /** 专辑详情 + 曲目列表 */
    public function albumShow(Request $request, string $id): AlbumDetailResource
    {
        $validated = $request->validate(['plugName' => 'string']);

        $data = $this->runPlugin(
            $validated['plugName'] ?? 'kw',
            fn (SourcePlugin $p) => $p->albumInfo($id),
        );

        return new AlbumDetailResource($data);
    }

    private function keyword(array $validated): string
    {
        // required 规则已拦纯空白（422），此处只做 trim 规整
        return trim($validated['keyword']);
    }

    /** @return array{int, int} [page, pageSize] */
    private function pageParams(array $validated, int $defaultPageSize): array
    {
        return [(int) ($validated['page'] ?? 1), (int) ($validated['pageSize'] ?? $defaultPageSize)];
    }

    /** 插件调用的公共包装：注册校验（未开启 → 404）+ 异常转 502 */
    private function runPlugin(string $plugName, callable $call): mixed
    {
        if (! $this->sources->has($plugName)) {
            throw ApiException::notFound("音源插件 {$plugName} 未开启");
        }

        try {
            return $call($this->sources->get($plugName));
        } catch (Throwable $e) {
            report($e);

            throw ApiException::upstream('音源请求失败：'.self::errorDetail($e));
        }
    }
}
