<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 歌词响应：旧契约把 LRC 文本放 msg 字段（无 data），属历史瑕疵特例；
 * V2 回归标准 JSON 体 {lyric: "..."}，前端不再需要 msg 兼容分支。
 *
 * @property array{lyric: string} $resource
 */
class LyricResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'lyric' => (string) ($this->resource['lyric'] ?? ''),
        ];
    }
}
