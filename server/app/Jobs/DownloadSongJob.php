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
 * 直链有时效只能即用即取；失败进 error 由用户手动重试（不做自动重试）。
 * 落盘成功后按路径模板（MC_MUSIC_DOWNLOAD_PATH_TEMPLATE）重排为「歌手/专辑/」结构（Navidrome 友好）。
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

        // 目录重排（Navidrome 友好）：失败保持平铺原位，不影响任务成功状态
        try {
            $layout = $this->relocateByTemplate($sources, $plugin, $task, $final);
            if ($layout !== null) {
                $task->forceFill(['file_path' => $layout, 'update_time' => now()])->save();
            }
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * 按 MC_MUSIC_DOWNLOAD_PATH_TEMPLATE 把成品文件移入「歌手/专辑/」两级目录。
     * 专辑上下文（专辑歌手/年份/音轨号）经本机插件原生查询（albumInfoById），
     * 无专辑 id 或查询失败时用任务自带字段尽力渲染；无法得出有效路径返回 null（保持平铺）。
     * 返回重排后的绝对路径。
     */
    private function relocateByTemplate(
        SourceManager $sources,
        SourcePlugin $plugin,
        DownloadTask $task,
        string $currentAbs,
    ): ?string {
        $template = trim((string) config('mc.download.path_template'));
        if ($template === '') {
            return null; // 模板为空 = 关闭
        }

        $baseDir = (string) config('mc.download.dir');
        $realBase = realpath($baseDir) ?: $baseDir;

        $albumArtist = $task->artist_name ?? '';
        $albumName = $task->album_name ?? '';
        $year = '';
        $trackNo = '';
        if ($task->album_id !== null && $task->album_id !== '') {
            try {
                $info = $plugin->albumInfo($task->album_id);
                $albumArtist = ($info['albumArtist'] ?? '') !== '' ? (string) $info['albumArtist'] : $albumArtist;
                $albumName = ($info['albumName'] ?? '') !== '' ? (string) $info['albumName'] : $albumName;
                $year = substr((string) ($info['albumTime'] ?? ''), 0, 4);
                foreach (($info['musics'] ?? []) as $m) {
                    if ((string) ($m['id'] ?? '') === (string) $task->music_id) {
                        $n = (int) ($m['trackNo'] ?? 0);
                        $trackNo = $n > 0 ? (string) $n : '';

                        break;
                    }
                }
            } catch (Throwable $e) {
                report($e); // 专辑上下文失败：用任务自带字段尽力渲染
            }
        }

        $ext = strtolower(pathinfo($currentAbs, PATHINFO_EXTENSION));
        $values = [
            '{albumArtist}' => $albumArtist,
            '{album}' => $albumName,
            '{artist}' => $task->artist_name ?? '',
            '{title}' => $task->music_name,
            '{year}' => $year,
            '{trackNo}' => $trackNo,
            '{ext}' => $ext,
        ];

        // 渲染模板：逐段替换 → 清理非法字符与结尾点；中间空段（如无专辑时的 {album}/）整体丢弃
        $rawSegs = explode('/', $template);
        $count = count($rawSegs);
        $segs = [];
        foreach ($rawSegs as $i => $seg) {
            $s = str_replace(array_keys($values), array_values($values), $seg);
            $s = trim((string) preg_replace('/[\\\\\/:*?"<>|]/', '_', $s));
            $s = (string) preg_replace('/[.\s]+$/u', '', $s);
            if ($i < $count - 1 && $s === '') {
                continue;
            }
            $segs[] = $s;
        }

        // 文件名段（最后一段）：词干只剩分隔符残渣（- _ 空格 点）视为变量全空，保持平铺
        $file = (string) end($segs);
        $file = (string) preg_replace('/\s+\./', '.', $file);
        $stem = pathinfo($file, PATHINFO_FILENAME);
        if ($file === '' || trim(str_replace(['-', '_', ' '], '', $stem), '.') === '') {
            return null;
        }
        $segs[count($segs) - 1] = $file;

        $target = $baseDir.'/'.implode('/', $segs);
        // WSL /mnt/c（9p）对本进程刚 rename 出的文件 stat/realpath 短暂不可见：
        // 先清统计缓存，且仅在目标真实存在时才可能判「已在目标位置」——
        // 否则首次下载（目标必然不存在）会因 realpath 双双返回 false 被误判为同位置而静默跳过
        clearstatcache();
        if (is_file($target) && realpath($target) === realpath($currentAbs)) {
            return null; // 已在目标位置
        }

        // 冲突处理：同名追加序号；同内容视为重复下载，删源保留既有文件
        // （stat 失败时放弃去重、降级为追加序号，不让告警中断重排）
        $candidate = $target;
        $n = 2;
        while (is_file($candidate)) {
            clearstatcache();
            $sizeExisting = filesize($candidate);
            $sizeCurrent = filesize($currentAbs);
            if ($sizeExisting !== false && $sizeCurrent !== false
                && $sizeExisting === $sizeCurrent && md5_file($candidate) === md5_file($currentAbs)) {
                @unlink($currentAbs);
                $this->cleanEmptyDirs(dirname($currentAbs), $baseDir);

                return $candidate;
            }
            $candidate = (string) preg_replace('/(\.[^.]+)$/', ' ('.$n.')$1', $target);
            $n++;
        }

        if (! is_dir(dirname($candidate))) {
            mkdir(dirname($candidate), 0775, true);
        }
        rename($currentAbs, $candidate);
        $this->cleanEmptyDirs(dirname($currentAbs), $baseDir);

        return $candidate;
    }

    /** 自底向上清理因移动而变空的目录（不超过下载根目录） */
    private function cleanEmptyDirs(string $dir, string $baseDir): void
    {
        $base = rtrim($baseDir, '/\\');
        $cur = $dir;
        while (is_dir($cur) && str_starts_with(realpath($cur) ?: $cur, $base) && realpath($cur) !== $base) {
            $entries = glob($cur.'/*') ?: [];
            if ($entries !== []) {
                break;
            }
            @rmdir($cur);
            $cur = dirname($cur);
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
