<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 专辑详情：专辑字段（复用 AlbumResource 映射）+ songs 曲目列表
 * （旧口径 musics → songs，条目为统一 SongResource）。
 *
 * @property array<string, mixed> $resource
 */
class AlbumDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $r = $this->resource;
        $album = (new AlbumResource($r))->toArray($request);
        $album['songs'] = SongResource::collection($r['musics'] ?? []);

        return $album;
    }
}
