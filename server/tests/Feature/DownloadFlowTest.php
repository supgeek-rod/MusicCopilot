<?php

namespace Tests\Feature;

use App\Jobs\DownloadSongJob;
use App\Jobs\ExpandArtistAlbumJob;
use App\Models\DownloadTask;
use App\Plugins\Sources\SourceManager;
use App\Services\DownloadTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class DownloadFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $downloadDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->downloadDir = sys_get_temp_dir().'/mc-dl-test-'.uniqid();
        mkdir($this->downloadDir, 0775, true);
        config(['mc.download.dir' => $this->downloadDir]);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->downloadDir.'/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->downloadDir);
        parent::tearDown();
    }

    private function songPayload(): array
    {
        // 对齐前端 QualityMenu queue()：完整 SongRecord + 可选 brType
        return [
            'id' => '228908',
            'name' => '晴天',
            'artistName' => ['周杰伦'],
            'albumName' => '叶惠美',
            'albumid' => '1293',
            'plugName' => 'kw',
            'duration' => '269000',
            'brTypes' => ['KW_FLAC_2000', 'KW_MP3_320', 'KW_MP3_128'],
            'dataInfo' => ['MINFO' => 'level:h,bitrate:128,format:mp3,size:4.12Mb', 'N_MINFO' => 'level:ff,bitrate:2000,format:flac,size:52.83Mb'],
        ];
    }

    public function test_download_song_creates_task_and_dispatches_job(): void
    {
        Queue::fake();

        $this->withSqmusicToken()
            ->postJson('/api/download/downloadSong', $this->songPayload())
            ->assertOk()
            ->assertJsonPath('code', 200);

        $task = DownloadTask::query()->sole();
        $this->assertSame('waiting', $task->status);
        $this->assertSame('228908', $task->music_id);
        $this->assertSame('晴天', $task->music_name);
        $this->assertSame('周杰伦', $task->artist_name);
        // musicInfo 为上游原始条目（顶层含 MINFO/N_MINFO，前端估算大小用）
        $info = json_decode((string) $task->music_info, true);
        $this->assertSame('level:h,bitrate:128,format:mp3,size:4.12Mb', $info['MINFO']);

        Queue::assertPushed(DownloadSongJob::class, fn (DownloadSongJob $job) => $job->taskId === $task->id);
    }

    public function test_download_song_rejects_missing_name(): void
    {
        $this->withSqmusicToken()
            ->postJson('/api/download/downloadSong', ['id' => '228908', 'plugName' => 'kw'])
            ->assertOk()
            ->assertJsonPath('code', 500);
    }

    public function test_download_album_expands_tracks_and_returns_contract_array(): void
    {
        Queue::fake();
        Http::fake([
            '*stype=albuminfo*' => Http::response($this->fakeAlbumInfo()),
        ]);

        $response = $this->withSqmusicToken()
            ->postJson('/api/download/downloadAlbum', [
                'albumName' => '叶惠美',
                'albumid' => '1293',
                'artistName' => '周杰伦',
                'plugName' => 'kw',
                'bit' => 2000,
            ]);

        $response->assertOk()->assertJsonPath('code', 200);
        $created = $response->json('data');
        $this->assertIsArray($created);
        $this->assertCount(2, $created);
        $this->assertSame('晴天', $created[0]['downloadMusicname']);
        $this->assertSame('waiting', $created[0]['downloadStatus']);
        $this->assertSame('KW_FLAC_2000', $created[0]['downloadBrType']);

        // bit=2000 → KW_FLAC_2000
        $this->assertSame('KW_FLAC_2000', DownloadTask::query()->first()->br_type);
        Queue::assertPushed(DownloadSongJob::class, 2);
    }

    public function test_download_album_rejects_unknown_bit(): void
    {
        $this->withSqmusicToken()
            ->postJson('/api/download/downloadAlbum', ['albumid' => '1293', 'plugName' => 'kw', 'bit' => 999])
            ->assertOk()
            ->assertJsonPath('code', 500);
    }

    public function test_download_artist_album_expands_async(): void
    {
        Queue::fake();

        $this->withSqmusicToken()
            ->postJson('/api/download/downloadArtistAlbum', [
                'artistName' => '周杰伦',
                'artistid' => '336',
                'plugName' => 'kw',
            ])
            ->assertOk()
            ->assertJsonPath('code', 200);

        Queue::assertPushed(ExpandArtistAlbumJob::class);
        $this->assertSame(0, DownloadTask::query()->count());

        // 异步执行展开：2 张专辑（2 首 + 1 首）→ 3 个任务
        Http::fake([
            '*stype=artistinfo*' => Http::response(['name' => '周杰伦', 'albumnum' => '2']),
            '*stype=albumlist*' => Http::response(['albumlist' => [
                ['albumid' => '9001', 'name' => '专辑A'],
                ['albumid' => '9002', 'name' => '专辑B'],
            ]]),
            '*albumid=9001*' => Http::response($this->fakeAlbumInfo('9001', '专辑A')),
            '*albumid=9002*' => Http::response($this->fakeAlbumInfo('9002', '专辑B')),
        ]);
        (new ExpandArtistAlbumJob('kw', '336', 'KW_MP3_320'))
            ->handle(app(SourceManager::class), app(DownloadTaskService::class));

        $this->assertSame(4, DownloadTask::query()->count());
        Queue::assertPushed(DownloadSongJob::class, 4);
    }

    public function test_job_downloads_file_and_succeeds(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['bitrate' => 128, 'duration' => 269, 'format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('ID3-FAKE-MP3-BYTES'),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes());
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        $task->refresh();
        $this->assertSame('success', $task->status);
        $this->assertSame('KW_MP3_128', $task->br_type);
        $this->assertSame('周杰伦 - 晴天.mp3', basename((string) $task->file_path));
        $this->assertFileExists($task->file_path);
        $this->assertSame('ID3-FAKE-MP3-BYTES', file_get_contents($task->file_path));
        $this->assertNotNull($task->download_time);
        $this->assertNull($task->error_msg);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'br=128kmp3'));
    }

    public function test_job_auto_picks_highest_available_br_type(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['bitrate' => 2000, 'format' => 'flac', 'url' => 'http://kw-er.kuwo.cn/x/F000.flac'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('fLaC'),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes(['br_type' => '', 'br_types' => ['KW_MP3_128', 'KW_FLAC_2000']]));
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        $task->refresh();
        $this->assertSame('success', $task->status);
        $this->assertSame('KW_FLAC_2000', $task->br_type);
        $this->assertSame('周杰伦 - 晴天.flac', basename((string) $task->file_path));

        Http::assertSent(fn ($request) => str_contains($request->url(), 'br=2000kflac'));
    }

    public function test_job_marks_error_on_region_block(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 407,
                'data' => ['url' => 'None'],
                'msg' => 'copyright protection',
            ]),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes());
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        $task->refresh();
        $this->assertSame('error', $task->status);
        $this->assertStringContainsString('大陆 IP 区域限制', (string) $task->error_msg);
        $this->assertNull($task->file_path);
    }

    public function test_job_discards_file_when_task_deleted_mid_download(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('ID3-BYTES'),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes());
        $taskId = $task->id;
        $task->delete();

        (new DownloadSongJob($taskId))->handle(app(SourceManager::class));

        $this->assertSame('', implode('', glob($this->downloadDir.'/*') ?: []));
    }

    public function test_filename_sanitization_and_collision_suffix(): void
    {
        // 闭包 fake：同一 stub 被多个请求消费时，普通 Http::response 的响应体流会耗尽（第二次 sink 拿到空文件）
        Http::fake([
            'mobi.kuwo.cn/*' => fn () => Http::response([
                'code' => 200,
                'data' => ['format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => fn () => Http::response('X'),
        ]);

        // 非法字符清洗
        $task = DownloadTask::query()->create($this->taskAttributes(['music_name' => 'A/B:C*?']));
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));
        $task->refresh();
        $this->assertSame('success', $task->status, (string) $task->error_msg);
        $this->assertSame('周杰伦 - A_B_C__.mp3', basename((string) $task->file_path));

        // 同名任务落盘不覆盖：追加序号
        $second = DownloadTask::query()->create($this->taskAttributes(['music_name' => 'A/B:C*?']));
        (new DownloadSongJob($second->id))->handle(app(SourceManager::class));
        $second->refresh();
        $this->assertSame('success', $second->status, (string) $second->error_msg);
        $this->assertSame('周杰伦 - A_B_C__ (2).mp3', basename((string) $second->file_path));
    }

    public function test_job_notifies_scraper_with_ground_truth(): void
    {
        config([
            'mc.download.scraper_url' => 'http://scraper.local/mc/api',
            'mc.download.scraper_token' => 'tok-123',
        ]);
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('ID3-BYTES'),
            'scraper.local/*' => Http::response(['jobId' => 'j1'], 202),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes([
            'pic' => 'https://img3.kuwo.cn/star/albumcover/500/x.jpg',
        ]));
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        $task->refresh();
        $this->assertSame('success', $task->status);

        Http::assertSent(function ($request): bool {
            if (! str_starts_with($request->url(), 'http://scraper.local/mc/api/downloads')) {
                return false;
            }
            if (($request->header('x-mc-token')[0] ?? null) !== 'tok-123') {
                return false;
            }
            $body = $request->data();

            return $body['fileName'] === '周杰伦 - 晴天.mp3'
                && $body['musicId'] === '228908'
                && $body['name'] === '晴天'
                && $body['artist'] === '周杰伦'
                && $body['album'] === '叶惠美'
                && $body['coverUrl'] === 'https://img3.kuwo.cn/star/albumcover/500/x.jpg';
        });
    }

    public function test_job_survives_scraper_failure(): void
    {
        config(['mc.download.scraper_url' => 'http://scraper.local/mc/api']);
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('ID3-BYTES'),
            'scraper.local/*' => Http::response(['error' => 'boom'], 500),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes());
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        // 通知失败不回滚任务状态
        $task->refresh();
        $this->assertSame('success', $task->status);
        $this->assertFileExists($task->file_path);
    }

    public function test_job_skips_notification_when_scraper_not_configured(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('ID3-BYTES'),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes());
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        $task->refresh();
        $this->assertSame('success', $task->status);
        // 仅直链解析 + 文件下载两次上游请求，无 scraper 通知
        Http::assertSentCount(2);
    }

    /** @param array<string, mixed> $overrides */
    private function taskAttributes(array $overrides = []): array
    {
        return array_merge([
            'plug_name' => 'kw',
            'music_id' => '228908',
            'music_name' => '晴天',
            'artist_name' => '周杰伦',
            'album_name' => '叶惠美',
            'album_id' => '1293',
            'br_type' => 'KW_MP3_128',
            'br_types' => ['KW_FLAC_2000', 'KW_MP3_320', 'KW_MP3_128'],
            'music_info' => json_encode(['MINFO' => 'level:h,bitrate:128,format:mp3,size:4.12Mb'], JSON_UNESCAPED_UNICODE),
            'status' => DownloadTask::STATUS_WAITING,
            'update_time' => now(),
        ], $overrides);
    }

    private function fakeAlbumInfo(string $albumId = '1293', string $albumName = '叶惠美'): array
    {
        return [
            'albumid' => $albumId,
            'name' => $albumName,
            'artist' => '周杰伦',
            'artistid' => '336',
            'pub' => '2003-07-31',
            'musiclist' => [
                ['musicrid' => '228908', 'name' => '晴天', 'artist' => '周杰伦', 'album' => $albumName, 'albumId' => (int) $albumId, 'duration' => '269', 'N_MINFO' => 'level:ff,bitrate:2000,format:flac,size:52.83Mb;level:h,bitrate:128,format:mp3,size:4.12Mb'],
                ['musicrid' => '79476', 'name' => '懦夫', 'artist' => '周杰伦', 'album' => $albumName, 'albumId' => (int) $albumId, 'duration' => '269', 'MINFO' => 'level:p,bitrate:320,format:mp3,size:8.32Mb'],
            ],
        ];
    }
}
