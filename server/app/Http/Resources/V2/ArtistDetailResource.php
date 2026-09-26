<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 歌手详情 + 全部专辑：旧口径 musicArtistsName/musicArtistsPhoto/... →
 * name/photo/alias/description，albums 为统一 AlbumResource。
 *
 * @property array<string, mixed> $resource
 */
class ArtistDetailResource extends JsonResource
{
    use NormalizesPluginData;

    public function toArray(Request $request): array
    {
        $r = $this->resource;

        return [
            'id' => self::intOrNull($r['id'] ?? null) ?? 0,
            'name' => (string) ($r['musicArtistsName'] ?? ''),
            'alias' => self::stringOrNull($r['musicArtistsAlias'] ?? null),
            'photo' => self::stringOrNull($r['musicArtistsPhoto'] ?? null),
            'description' => self::stringOrNull($r['musicArtistsDescribe'] ?? null),
            'albums' => AlbumResource::collection($r['albums'] ?? []),
        ];
    }
}
