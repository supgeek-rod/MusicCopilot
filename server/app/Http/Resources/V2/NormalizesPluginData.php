<?php

namespace App\Http\Resources\V2;

/**
 * V2 类型归一：插件层输出的字符串数字（SQMusic 过渡契约遗留口径）在此收敛为
 * 真整数/真字符串。插件解析链路不动，转换只发生在 V2 响应资源层。
 */
trait NormalizesPluginData
{
    /** @param mixed $value @return list<string> */
    protected static function strings(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $v) {
            $s = trim((string) $v);
            if ($s !== '') {
                $out[] = $s;
            }
        }

        return $out;
    }

    /** 字符串数字列表 → int 列表（非数值项丢弃） */
    protected static function ints(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $v) {
            if (is_numeric($v)) {
                $out[] = (int) $v;
            }
        }

        return $out;
    }

    protected static function intOrNull(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric($value) ? (int) $value : null;
    }

    protected static function stringOrNull(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $s = trim((string) $value);

        return $s === '' ? null : $s;
    }

    /**
     * duration 统一毫秒 int：搜索条目为毫秒字符串（旧契约口径），
     * 专辑曲目条目为秒 int|null（上游原样）。
     *
     * @param  array<string, mixed>  $r
     */
    protected static function durationMs(array $r): ?int
    {
        if (array_key_exists('duration', $r)) {
            return self::intOrNull($r['duration']);
        }

        $sec = self::intOrNull($r['musicDuration'] ?? null);

        return $sec !== null ? $sec * 1000 : null;
    }
}
