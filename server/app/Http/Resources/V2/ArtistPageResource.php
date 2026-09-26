<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property array{items: mixed, total: int, page: int, pageSize: int} $resource */
class ArtistPageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'items' => ArtistResource::collection($this->resource['items']),
            'total' => (int) $this->resource['total'],
            'page' => (int) $this->resource['page'],
            'pageSize' => (int) $this->resource['pageSize'],
        ];
    }
}
