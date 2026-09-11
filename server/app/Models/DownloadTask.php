<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 下载任务。状态机：waiting（等待）→ loading（解析直链）→ downloading（传输）→
 * success / error；error 可经 errorTaskRetry 回到 waiting。
 */
class DownloadTask extends Model
{
    public const STATUS_WAITING = 'waiting';
    public const STATUS_LOADING = 'loading';
    public const STATUS_DOWNLOADING = 'downloading';
    public const STATUS_SUCCESS = 'success';
    public const STATUS_ERROR = 'error';

    protected $fillable = [
        'plug_name', 'music_id', 'music_name', 'artist_name', 'album_name', 'album_id',
        'br_type', 'br_types', 'music_info', 'status', 'progress', 'file_path', 'error_msg',
        'download_gid', 'download_time', 'update_time',
    ];

    protected function casts(): array
    {
        return [
            'br_types' => 'array',
            'download_time' => 'datetime',
            'update_time' => 'datetime',
        ];
    }

    /** 状态回写（download_update_time 契约口径） */
    public function markStatus(string $status, ?string $errorMsg = null): void
    {
        $this->forceFill([
            'status' => $status,
            'error_msg' => $errorMsg,
            'update_time' => now(),
        ])->save();
    }

    /**
     * 契约对齐 SQMusic TaskInfo（前端 src/api/types.ts）。
     * downloadMusicInfo 为上游原始条目 JSON（顶层含 MINFO/N_MINFO 可估算大小）。
     */
    public function toContract(): array
    {
        return [
            'id' => $this->id,
            'downloadGid' => $this->download_gid,
            'downloadTime' => $this->download_time?->format('Y-m-d H:i:s'),
            'downloadFile' => $this->file_path,
            'downloadMusicId' => $this->music_id,
            'downloadPlugName' => $this->plug_name,
            'downloadBrType' => $this->br_type,
            'downloadMusicname' => $this->music_name,
            'downloadArtistname' => $this->artist_name,
            'downloadAlbumname' => $this->album_name,
            'downloadMsg' => $this->error_msg,
            'downloadMusicInfo' => $this->music_info,
            'downloadStatus' => $this->status,
            'springName' => null,
            'audioBook' => null,
            'downloadUpdateTime' => $this->update_time?->format('Y-m-d H:i:s'),
            'rewriteMp3tag' => null,
            'downloadBits' => null,
            'downloadBrTypes' => $this->br_types,
        ];
    }
}
