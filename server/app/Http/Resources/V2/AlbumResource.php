<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 专辑形态：搜索结果条目与歌手详情下的专辑条目统一为同一结构
 * （搜索侧带 trackCount、详情侧带 publishTime/description，字段可选）。
 * 旧口径：albumName/albumid/artistName/artistid/total → name/id/artist/artistId/trackCount（int）。
 *
 * @property array<string, mixed> $resource
 */
class AlbumResource extends JsonResource
{
    use NormalizesPluginData;

    public function toArray(Request $request): array
    {
        $r = $this->resource;
        $dataInfo = is_array($r['dataInfo'] ?? null) ? $r['dataInfo'] : [];

        return [
            'id' => self::intOrNull($r['albumid'] ?? $r['albumId'] ?? null) ?? 0,
            'name' => (string) ($r['albumName'] ?? ''),
            'artist' => self::stringOrNull($r['artistName'] ?? $r['albumArtist'] ?? null),
            'artistId' => self::intOrNull($r['artistid'] ?? $r['albumArtistId'] ?? null),
            'pic' => self::stringOrNull($r['pic'] ?? $r['albumImg'] ?? null),
            // 搜索条目带 total；歌手详情条目（mapAlbumDetail 不映射 total）从上游原始行 musiccnt 兜底
            'trackCount' => self::intOrNull($r['total'] ?? $dataInfo['musiccnt'] ?? null),
            'publishTime' => self::stringOrNull($r['albumTime'] ?? null),
            'description' => self::stringOrNull($r['albumDescribe'] ?? null),
            'plugName' => (string) ($r['plugName'] ?? ''),
        ];
    }
}
