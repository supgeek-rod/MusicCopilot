<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 音质枚举：旧口径 {id, value, type, bit, plugName, springName} 收敛为 4 字段
 * （value 恒等于 id、springName 为插件内部别名，均冗余）。
 *
 * @property array<string, mixed> $resource
 */
class BrTypeResource extends JsonResource
{
    use NormalizesPluginData;

    public function toArray(Request $request): array
    {
        $r = $this->resource;

        return [
            'id' => (string) ($r['id'] ?? ''),
            'type' => (string) ($r['type'] ?? ''),
            'bit' => self::intOrNull($r['bit'] ?? null) ?? 0,
            'plugName' => (string) ($r['plugName'] ?? ''),
        ];
    }
}
