<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 音源插件元信息：{label, value}（value 即 plugName）。
 *
 * @property array{label: string, value: string} $resource
 */
class PlugOptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'label' => (string) $this->resource['label'],
            'value' => (string) $this->resource['value'],
        ];
    }
}
