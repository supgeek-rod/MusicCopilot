<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 统一歌曲形态：搜索条目（name/artistName/albumid/毫秒字符串 duration）与
 * 专辑曲目条目（musicName/musicArtists/musicDuration 秒 int）归一化为同一结构。
 * 替代旧契约的 SongRecord/AlbumSong 双形态，前端 adapter 可整体移除。
 *
 * dataInfo 透传上游原始条目：下载创建（POST /v2/downloads/songs）以此作为
 * music_info 落库，前端按入队音质从 MINFO/N_MINFO 估算大小——不可裁剪，
 * 否则新任务大小列恒为空（D6）。
 *
 * @property array<string, mixed> $resource
 */
class SongResource extends JsonResource
{
    use NormalizesPluginData;

    public function toArray(Request $request): array
    {
        $r = $this->resource;
        $dataInfo = is_array($r['dataInfo'] ?? null) ? $r['dataInfo'] : [];

        return [
            'id' => self::intOrNull($r['id'] ?? null) ?? 0,
            'name' => (string) ($r['name'] ?? $r['musicName'] ?? ''),
            'artists' => self::strings($r['artistName'] ?? $r['musicArtists'] ?? []),
            'artistIds' => self::ints($r['artistids'] ?? $r['artistsIds'] ?? []),
            'albumId' => self::intOrNull($r['albumid'] ?? $r['albumId'] ?? null),
            'albumName' => self::stringOrNull($r['albumName'] ?? $r['musicAlbum'] ?? null),
            'pic' => self::stringOrNull($r['pic'] ?? $r['musicImage'] ?? null),
            'duration' => self::durationMs($r),
            'brTypes' => self::strings($r['brTypes'] ?? $r['bits'] ?? []),
            'plugName' => (string) ($r['plugName'] ?? ''),
            'dataInfo' => self::dataInfoOf($r['dataInfo'] ?? null),
            'playcnt' => self::intOrNull($dataInfo['playcnt'] ?? null),
            'trackNo' => self::intOrNull($dataInfo['track'] ?? null),
        ];
    }

    /** 上游原始条目（顶层含 MINFO/N_MINFO/playcnt 等，空则 null） */
    private static function dataInfoOf(mixed $value): ?array
    {
        return is_array($value) && $value !== [] ? $value : null;
    }
}
