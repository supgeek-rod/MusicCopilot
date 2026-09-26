<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 直链解析结果。duration 统一毫秒 int（插件输出为秒 int|null）。
 *
 * @property array<string, mixed> $resource
 */
class DownloadUrlResource extends JsonResource
{
    use NormalizesPluginData;

    public function toArray(Request $request): array
    {
        $r = $this->resource;
        $sec = self::intOrNull($r['duration'] ?? null);

        return [
            'url' => (string) ($r['url'] ?? ''),
            'brType' => (string) ($r['brType'] ?? ''),
            'duration' => $sec !== null ? $sec * 1000 : null,
            'format' => self::stringOrNull($r['format'] ?? null),
        ];
    }
}
