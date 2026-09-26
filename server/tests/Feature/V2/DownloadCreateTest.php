<?php

namespace Tests\Feature\V2;

use App\Jobs\DownloadSongJob;
use App\Jobs\ExpandArtistAlbumJob;
use App\Models\DownloadTask;
use App\Plugins\Sources\SourceManager;
use App\Services\DownloadTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * API V2 下载创建：POST /api/v2/downloads/{songs,albums}、/downloads/artists/{id}。
 * 入参为 V2 统一形态；任务响应统一 {tasks: [...]}，歌手异步展开返回 202 {queued}。
 */
class DownloadCreateTest extends TestCase
{
    use RefreshDatabase;

    /** V2 统一 Song 形态（前端搜索记录直传） */
    private function songPayload(): array
    {
        return [
            'id' => 228908,
            'name' => '晴天',
            'artists' => ['周杰伦'],
            'artistIds' => [336],
            'albumId' => 1293,
            'albumName' => '叶惠美',
            'duration' => 269000,
            'brTypes' => ['KW_FLAC_2000', 'KW_MP3_320', 'KW_MP3_128'],
            'plugName' => 'kw',
            'dataInfo' => ['MINFO' => 'level:h,bitrate:128,format:mp3,size:4.12Mb', 'N_MINFO' => 'level:ff,bitrate:2000,format:flac,size:52.83Mb'],
        ];
    }

    public function test_store_song_creates_task_and_dispatches_job(): void
    {
        Queue::fake();

        $res = $this->postJson('/api/v2/downloads/songs', $this->songPayload());

        $res->assertOk();
        $tasks = $res->json('tasks');
        $this->assertCount(1, $tasks);
        $this->assertSame(228908, $tasks[0]['musicId']);
        $this->assertSame('晴天', $tasks[0]['name']);
        $this->assertSame('周杰伦', $tasks[0]['artist']);
        $this->assertSame('waiting', $tasks[0]['status']);

        $task = DownloadTask::query()->sole();
        $this->assertSame('waiting', $task->status);
        $this->assertSame('228908', $task->music_id);
        $this->assertSame('周杰伦', $task->artist_name);
        $this->assertSame('1293', $task->album_id);
        // musicInfo 为上游原始条目（顶层含 MINFO/N_MINFO，前端估算大小用）
        $info = json_decode((string) $task->music_info, true);
        $this->assertSame('level:h,bitrate:128,format:mp3,size:4.12Mb', $info['MINFO']);

        Queue::assertPushed(DownloadSongJob::class, fn (DownloadSongJob $job) => $job->taskId === $task->id);
    }

    public function test_search_result_feeds_download_create_with_music_info(): void
    {
        // D6 回归：UI 链路 = 搜索响应条目原样作为创建入参。SongResource 必须透传
        // dataInfo，否则该链路创建的任务 music_info 落库为 null、大小列恒空。
        Http::fake([
            'search.kuwo.cn/*' => Http::response([
                'TOTAL' => '1',
                'abslist' => [[
                    'MUSICRID' => 'MUSIC_228908',
                    'NAME' => '晴天',
                    'ARTIST' => '周杰伦',
                    'allartistid' => '336',
                    'ALBUM' => '叶惠美',
                    'ALBUMID' => '1293',
                    'DURATION' => '269',
                    'N_MINFO' => 'level:ff,bitrate:2000,format:flac,size:52.83Mb;level:h,bitrate:128,format:mp3,size:4.12Mb',
                ]],
            ]),
        ]);
        Queue::fake();

        $song = $this->getJson('/api/v2/search/songs?keyword='.urlencode('晴天').'&page=1&pageSize=30')
            ->assertOk()
            ->json('items.0');

        $this->postJson('/api/v2/downloads/songs', $song)->assertOk();

        $info = json_decode((string) DownloadTask::query()->sole()->music_info, true);
        $this->assertSame(
            'level:ff,bitrate:2000,format:flac,size:52.83Mb;level:h,bitrate:128,format:mp3,size:4.12Mb',
            $info['N_MINFO'],
        );
    }

    public function test_store_song_missing_name_returns_422(): void
    {
        $this->postJson('/api/v2/downloads/songs', ['id' => 228908, 'plugName' => 'kw'])
            ->assertStatus(422)
            ->assertJsonPath('error', 'validation_failed');
    }

    public function test_store_song_unknown_plugin_returns_404(): void
    {
        $payload = $this->songPayload();
        $payload['plugName'] = 'xx';

        $this->postJson('/api/v2/downloads/songs', $payload)
            ->assertStatus(404)
            ->assertJsonPath('error', 'not_found');
    }

    public function test_store_album_expands_tracks_into_tasks(): void
    {
        Queue::fake();
        Http::fake([
            '*stype=albuminfo*' => Http::response($this->fakeAlbumInfo()),
        ]);

        $res = $this->postJson('/api/v2/downloads/albums', [
            'id' => 1293,
            'name' => '叶惠美',
            'artist' => '周杰伦',
            'plugName' => 'kw',
            'bit' => 2000,
        ]);

        $res->assertOk();
        $tasks = $res->json('tasks');
        $this->assertIsArray($tasks);
        $this->assertCount(2, $tasks);
        $this->assertSame('晴天', $tasks[0]['name']);
        $this->assertSame('waiting', $tasks[0]['status']);
        $this->assertSame('KW_FLAC_2000', $tasks[0]['brType'], 'bit=2000 → KW_FLAC_2000');

        Queue::assertPushed(DownloadSongJob::class, 2);
    }

    public function test_store_album_rejects_unknown_bit_returns_400(): void
    {
        $this->postJson('/api/v2/downloads/albums', ['id' => 1293, 'plugName' => 'kw', 'bit' => 999])
            ->assertStatus(400)
            ->assertJsonPath('error', 'bad_request');
    }

    public function test_store_album_upstream_failure_returns_502(): void
    {
        Http::fake([
            '*stype=albuminfo*' => Http::response(['code' => 500], 500),
        ]);

        $this->postJson('/api/v2/downloads/albums', ['id' => 1293, 'plugName' => 'kw'])
            ->assertStatus(502)
            ->assertJsonPath('error', 'upstream_error');
    }

    public function test_store_artist_queues_async_expansion(): void
    {
        Queue::fake();

        $this->postJson('/api/v2/downloads/artists/336?plugName=kw')
            ->assertStatus(202)
            ->assertJsonPath('queued', true);

        Queue::assertPushed(ExpandArtistAlbumJob::class);
        $this->assertSame(0, DownloadTask::query()->count());

        // 异步执行展开：2 张专辑 × 2 首 → 4 个任务（job 内部链路不变）
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

    /** r.s stype=albuminfo（字段取自 2026-09-12 真实响应） */
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
