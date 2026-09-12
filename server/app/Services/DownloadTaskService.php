<?php

namespace App\Services;

use App\Jobs\DownloadSongJob;
use App\Models\DownloadTask;
use App\Plugins\Sources\SourceManager;

/**
 * 下载任务创建：单曲入参有两种口径（搜索 SongRecord / 专辑曲目 AlbumSong），统一归一化建任务。
 */
class DownloadTaskService
{
    public function __construct(private readonly SourceManager $sources)
    {
    }

    /** 整张专辑展开（downloadAlbum 同步调用）：建单曲任务并入队，返回契约记录数组 */
    public function expandAlbum(string $plugName, string $albumId, string $brType): array
    {
        $plugin = $this->sources->get($plugName);
        $info = $plugin->albumInfo($albumId);

        $created = [];
        foreach ($info['musics'] ?? [] as $song) {
            $task = $this->createTaskFromSong($plugName, is_array($song) ? $song : [], $brType);
            if ($task === null) {
                continue;
            }
            DownloadSongJob::dispatch($task->id);
            $created[] = $task->toContract();
        }

        return $created;
    }

    /** 歌手全部专辑展开（ExpandArtistAlbumJob 队列调用）：返回建任务数 */
    public function expandArtistAlbum(string $plugName, string $artistId, string $brType): int
    {
        $plugin = $this->sources->get($plugName);
        $artist = $plugin->artistAlbum($artistId);

        $count = 0;
        foreach ($artist['albums'] ?? [] as $album) {
            $albumId = (string) ($album['albumId'] ?? '');
            if ($albumId === '') {
                continue;
            }
            $info = $plugin->albumInfo($albumId);
            foreach ($info['musics'] ?? [] as $song) {
                $task = $this->createTaskFromSong($plugName, is_array($song) ? $song : [], $brType);
                if ($task === null) {
                    continue;
                }
                DownloadSongJob::dispatch($task->id);
                $count++;
            }
        }

        return $count;
    }

    /**
     * 建单曲任务；缺 id/name 的脏条目返回 null（由调用方跳过）。
     * musicInfo 存上游原始条目 JSON（顶层含 MINFO/N_MINFO，前端按入队音质估算大小）。
     */
    public function createTaskFromSong(string $plugName, array $song, string $brType): ?DownloadTask
    {
        $musicId = (string) ($song['id'] ?? '');
        $musicName = (string) ($song['name'] ?? $song['musicName'] ?? '');
        if ($musicId === '' || $musicName === '') {
            return null;
        }

        $artists = $song['artistName'] ?? $song['musicArtists'] ?? [];
        $artists = is_array($artists)
            ? array_values(array_filter(array_map(fn ($v) => trim((string) $v), $artists), fn ($v) => $v !== ''))
            : [];

        $albumName = (string) ($song['albumName'] ?? $song['musicAlbum'] ?? '');
        $albumId = (string) ($song['albumid'] ?? $song['albumId'] ?? '');
        $pic = (string) ($song['pic'] ?? $song['musicImage'] ?? '');
        $brTypes = array_values(array_filter(
            is_array($song['brTypes'] ?? $song['bits'] ?? null) ? ($song['brTypes'] ?? $song['bits']) : [],
            fn ($v) => is_string($v) && $v !== '',
        ));
        $raw = is_array($song['dataInfo'] ?? null) ? $song['dataInfo'] : [];

        return DownloadTask::query()->create([
            'plug_name' => $plugName,
            'music_id' => $musicId,
            'music_name' => $musicName,
            'artist_name' => $artists !== [] ? implode('&', $artists) : null,
            'album_name' => $albumName !== '' ? $albumName : null,
            'album_id' => $albumId !== '' ? $albumId : null,
            'pic' => $pic !== '' ? $pic : null,
            'br_type' => $brType,
            'br_types' => $brTypes !== [] ? $brTypes : null,
            'music_info' => $raw !== [] ? json_encode($raw, JSON_UNESCAPED_UNICODE) : null,
            'status' => DownloadTask::STATUS_WAITING,
            'update_time' => now(),
        ]);
    }
}
