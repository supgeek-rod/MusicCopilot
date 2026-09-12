<?php

namespace App\Jobs;

use App\Models\DownloadTask;
use App\Plugins\Sources\SourceManager;
use App\Plugins\Sources\SourcePlugin;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * 单曲下载 worker：解析直链（loading）→ 传输（downloading）→ 落盘（success）。
 * 直链有时效只能即用即取；失败进 error 由用户手动重试（对齐 SQMusic 语义，不做自动重试）。
 */
class DownloadSongJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    public function __construct(public readonly int $taskId)
    {
    }

    public function handle(SourceManager $sources): void
    {
        $task = DownloadTask::query()->find($this->taskId);
        if ($task === null || $task->status === DownloadTask::STATUS_SUCCESS) {
            return;
        }

        if (! $sources->has($task->plug_name)) {
            $task->markStatus(DownloadTask::STATUS_ERROR, "插件 {$task->plug_name} 未注册");

            return;
        }
        $plugin = $sources->get($task->plug_name);

        $task->markStatus(DownloadTask::STATUS_LOADING);
        try {
            $brType = $task->br_type !== ''
                ? $task->br_type
                : $this->autoBrType($plugin, $task->br_types ?? []);
            $info = $plugin->downloadUrl($task->music_id, $brType);
        } catch (Throwable $e) {
            $task->markStatus(DownloadTask::STATUS_ERROR, '直链解析失败：'.$e->getMessage());

            return;
        }

        $task->forceFill([
            'status' => DownloadTask::STATUS_DOWNLOADING,
            'br_type' => $info['brType'],
            'progress' => 1,
            'update_time' => now(),
        ])->save();

        $dir = (string) config('mc.download.dir');
        if (! is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $ext = strtolower((string) ($info['format'] ?? 'mp3'));
        $final = $this->uniquePath(
            $dir,
            $this->sanitize(($task->artist_name ?: '未知歌手').' - '.$task->music_name),
            $ext,
        );
        $tmp = $final.'.part';

        try {
            $response = Http::timeout(1800)->sink($tmp)->get($info['url']);
            if ($response->failed()) {
                throw new RuntimeException('文件下载 HTTP '.$response->status());
            }
            if (! is_file($tmp) || filesize($tmp) === 0) {
                throw new RuntimeException('文件下载为空');
            }
        } catch (Throwable $e) {
            @unlink($tmp);
            $task->markStatus(DownloadTask::STATUS_ERROR, '文件下载失败：'.$e->getMessage());

            return;
        }

        // 下载期间任务被删除：丢弃文件，不再写回任何状态
        if (! DownloadTask::query()->whereKey($this->taskId)->exists()) {
            @unlink($tmp);

            return;
        }

        rename($tmp, $final);
        $task->forceFill([
            'status' => DownloadTask::STATUS_SUCCESS,
            'file_path' => $final,
            'progress' => 100,
            'error_msg' => null,
            'download_time' => now(),
            'update_time' => now(),
        ])->save();

        $this->notifyScraper($task, basename($final));
    }

    /**
     * M4 自动刮削：fire-and-forget 通知 scraper 写标签（真值元数据，见 scraper /mc/api/downloads）。
     * 通知失败仅记录日志不回滚任务——scraper 不可达时标签可经体检页手动补。
     */
    private function notifyScraper(DownloadTask $task, string $fileName): void
    {
        $url = rtrim((string) config('mc.download.scraper_url'), '/');
        if ($url === '') {
            return;
        }

        $headers = [];
        $token = (string) config('mc.download.scraper_token');
        if ($token !== '') {
            $headers['x-mc-token'] = $token;
        }

        try {
            Http::timeout(10)
                ->withHeaders($headers)
                ->post($url.'/downloads', [
                    'fileName' => $fileName,
                    'plugName' => $task->plug_name,
                    'musicId' => $task->music_id,
                    'name' => $task->music_name,
                    'artist' => $task->artist_name,
                    'album' => $task->album_name,
                    'coverUrl' => $task->pic,
                    // 目录重排后 scraper 据此回写新路径
                    'taskId' => $task->id,
                ])
                ->throw();
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** 自动音质：任务可用清单 ∩ 插件枚举取码率最高；无参照时退 320k */
    private function autoBrType(SourcePlugin $plugin, array $available): string
    {
        $bits = [];
        foreach ($plugin->brTypeList() as $item) {
            $bits[$item['id']] = $item['bit'];
        }

        $candidates = [];
        foreach ($available as $id) {
            if (is_string($id) && isset($bits[$id])) {
                $candidates[$id] = $bits[$id];
            }
        }

        if ($candidates === []) {
            return 'KW_MP3_320';
        }

        return (string) array_search(max($candidates), $candidates, true);
    }

    /** 文件名清洗：路径分隔符与 Windows 非法字符替换为下划线 */
    private function sanitize(string $name): string
    {
        $name = trim((string) preg_replace('/[\\\\\/:*?"<>|]/', '_', $name));

        return $name !== '' ? $name : 'unknown';
    }

    /** 「歌手 - 标题」重名时追加序号 */
    private function uniquePath(string $dir, string $base, string $ext): string
    {
        $path = $dir.'/'.$base.'.'.$ext;
        $n = 2;
        while (file_exists($path)) {
            $path = $dir.'/'.$base.' ('.$n.').'.$ext;
            $n++;
        }

        return $path;
    }
}
