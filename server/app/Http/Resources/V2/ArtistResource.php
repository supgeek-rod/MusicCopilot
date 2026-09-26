<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 歌手形态（搜索结果；歌手详情见 ArtistDetailResource）。
 * 旧口径：artistName/artistid/total（字符串数字）→ name/id/albumCount（int）。
 *
 * @property array<string, mixed> $resource
 */
class ArtistResource extends JsonResource
{
    use NormalizesPluginData;

    public function toArray(Request $request): array
    {
        $r = $this->resource;

        return [
            'id' => self::intOrNull($r['artistid'] ?? $r['id'] ?? null) ?? 0,
            'name' => (string) ($r['artistName'] ?? $r['name'] ?? ''),
            'pic' => self::stringOrNull($r['pic'] ?? null),
            'albumCount' => self::intOrNull($r['total'] ?? null),
            'plugName' => (string) ($r['plugName'] ?? ''),
        ];
    }
}
