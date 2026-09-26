<?php

namespace Tests\Feature;

use App\Jobs\DownloadSongJob;
use App\Models\DownloadTask;
use App\Plugins\Sources\SourceManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * 下载 worker（DownloadSongJob）行为测试：落盘、音质选择、区域限制、
 * 文件名清洗、路径模板。HTTP 契约层见 Tests\Feature\V2\*。
 */
class DownloadFlowTest extends TestCase
{
    use RefreshDatabase;

    private string $downloadDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->downloadDir = sys_get_temp_dir().'/mc-dl-test-'.uniqid();
        mkdir($this->downloadDir, 0775, true);
        config(['mc.download.dir' => $this->downloadDir, 'mc.download.path_template' => '']);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->downloadDir.'/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->downloadDir);
        parent::tearDown();
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

    public function test_job_relocates_to_path_template(): void
    {
        config(['mc.download.path_template' => '{albumArtist}/{album}/{title} - {albumArtist}.{ext}']);
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => ['bitrate' => 128, 'duration' => 269, 'format' => 'mp3', 'url' => 'http://kw-er.kuwo.cn/x/M500.mp3'],
            ]),
            'kw-er.kuwo.cn/*' => Http::response('ID3-BYTES'),
        ]);

        $task = DownloadTask::query()->create($this->taskAttributes());
        (new DownloadSongJob($task->id))->handle(app(SourceManager::class));

        $task->refresh();
        $this->assertSame('success', $task->status);
        $this->assertStringContainsString('/周杰伦/叶惠美/', (string) $task->file_path);
        $this->assertSame('晴天 - 周杰伦.mp3', basename((string) $task->file_path));
        $this->assertFileExists($task->file_path);
    }

    public function test_job_keeps_flat_when_template_disabled(): void
    {
        config(['mc.download.path_template' => '']);
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
        $this->assertSame('周杰伦 - 晴天.mp3', basename((string) $task->file_path));
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
}
