<?php

namespace App\Http\Resources\V2;

use App\Models\DownloadTask;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 任务形态：旧 toContract 的 19 字段收敛为 15 字段——
 * 删恒空占位（downloadGid/springName/audioBook/rewriteMp3tag/downloadBits），
 * downloadMusicname/downloadArtistname/... 双前缀命名 → name/artist/album；
 * musicId/albumId 字符串数字 → int。musicInfo 保留上游原始条目 JSON 字符串
 * （前端按入队音质估算大小依赖它）。
 */
class TaskResource extends JsonResource
{
    use NormalizesPluginData;

    /** @param DownloadTask $resource */
    public function toArray(Request $request): array
    {
        /** @var DownloadTask $task */
        $task = $this->resource;

        return [
            'id' => (int) $task->id,
            'musicId' => self::intOrNull($task->music_id),
            'plugName' => (string) $task->plug_name,
            'name' => (string) $task->music_name,
            'artist' => self::stringOrNull($task->artist_name),
            'album' => self::stringOrNull($task->album_name),
            'albumId' => self::intOrNull($task->album_id),
            'pic' => self::stringOrNull($task->pic),
            'brType' => self::stringOrNull($task->br_type),
            'brTypes' => $task->br_types,
            'status' => (string) $task->status,
            'error' => self::stringOrNull($task->error_msg),
            'file' => self::stringOrNull($task->file_path),
            'musicInfo' => self::stringOrNull($task->music_info),
            'downloadedAt' => $task->download_time?->format('Y-m-d H:i:s'),
            'updatedAt' => $task->update_time?->format('Y-m-d H:i:s'),
        ];
    }
}
