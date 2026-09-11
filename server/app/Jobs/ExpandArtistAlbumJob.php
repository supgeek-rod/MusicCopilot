<?php

namespace App\Jobs;

use App\Services\DownloadTaskService;
use App\Plugins\Sources\SourceManager;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * 歌手全部专辑展开：逐张 albuminfo 后建单曲任务入队。
 * 专辑数量大（每张一次上游请求），必须异步跑，HTTP 请求立即返回。
 */
class ExpandArtistAlbumJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    public function __construct(
        public readonly string $plugName,
        public readonly string $artistId,
        public readonly string $brType,
    ) {
    }

    public function handle(SourceManager $sources, DownloadTaskService $service): void
    {
        $service->expandArtistAlbum($this->plugName, $this->artistId, $this->brType);
    }
}
