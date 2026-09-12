<?php

namespace Tests\Feature;

use App\Jobs\DownloadSongJob;
use App\Models\DownloadTask;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TaskManageTest extends TestCase
{
    use RefreshDatabase;

    private function createTask(array $overrides = []): DownloadTask
    {
        return DownloadTask::query()->create(array_merge([
            'plug_name' => 'kw',
            'music_id' => (string) random_int(100000, 999999),
            'music_name' => '晴天',
            'artist_name' => '周杰伦',
            'br_type' => 'KW_MP3_320',
            'status' => DownloadTask::STATUS_WAITING,
            'update_time' => now(),
        ], $overrides));
    }

    public function test_list_paginates_and_filters_by_status(): void
    {
        $this->createTask(['music_name' => '新任务']);
        $this->createTask(['music_name' => '成功任务', 'status' => DownloadTask::STATUS_SUCCESS]);
        $this->createTask(['music_name' => '失败任务', 'status' => DownloadTask::STATUS_ERROR]);

        // 不筛选：id 倒序 + 分页字段（MyBatis-Plus 风格）
        $res = $this->withSqmusicToken()
            ->postJson('/api/task/list', ['pageIndex' => 1, 'pageSize' => 2]);
        $res->assertOk()->assertJsonPath('code', 200);
        $data = $res->json('data');
        $this->assertSame(3, $data['total']);
        $this->assertSame(2, $data['size']);
        $this->assertSame(1, $data['current']);
        $this->assertSame(2, $data['pages']);
        $this->assertCount(2, $data['records']);
        $this->assertSame('失败任务', $data['records'][0]['downloadMusicname']);

        // 状态筛选
        $res = $this->withSqmusicToken()
            ->postJson('/api/task/list', ['downloadStatus' => 'error']);
        $records = $res->json('data.records');
        $this->assertSame(1, $res->json('data.total'));
        $this->assertSame('error', $records[0]['downloadStatus']);

        // 契约字段形状
        $this->assertArrayHasKey('downloadMusicInfo', $records[0]);
        $this->assertArrayHasKey('downloadUpdateTime', $records[0]);
        $this->assertArrayHasKey('downloadBrTypes', $records[0]);
    }

    public function test_del_removes_single_task(): void
    {
        $task = $this->createTask();

        $this->withSqmusicToken()
            ->postJson('/api/task/del', ['id' => $task->id])
            ->assertOk()
            ->assertJsonPath('code', 200);

        $this->assertDatabaseMissing('download_tasks', ['id' => $task->id]);
    }

    public function test_refresh_task_requeues_active_task_only(): void
    {
        Queue::fake();
        $waiting = $this->createTask();
        $success = $this->createTask(['status' => DownloadTask::STATUS_SUCCESS]);
        $error = $this->createTask(['status' => DownloadTask::STATUS_ERROR]);

        $this->withSqmusicToken()
            ->postJson('/api/task/refreshTask', ['id' => $waiting->id])
            ->assertOk()
            ->assertJsonPath('code', 200);
        Queue::assertPushed(DownloadSongJob::class, 1);

        $this->withSqmusicToken()
            ->postJson('/api/task/refreshTask', ['id' => $success->id])
            ->assertOk()
            ->assertJsonPath('code', 500);

        $this->withSqmusicToken()
            ->postJson('/api/task/refreshTask', ['id' => $error->id])
            ->assertOk()
            ->assertJsonPath('code', 500);
    }

    public function test_error_task_retry_requeues_error_task_only(): void
    {
        Queue::fake();
        $error = $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $waiting = $this->createTask();

        $this->withSqmusicToken()
            ->postJson('/api/task/errorTaskRetry', ['id' => $error->id])
            ->assertOk()
            ->assertJsonPath('code', 200);

        $error->refresh();
        $this->assertSame('waiting', $error->status);
        Queue::assertPushed(DownloadSongJob::class, 1);

        $this->withSqmusicToken()
            ->postJson('/api/task/errorTaskRetry', ['id' => $waiting->id])
            ->assertOk()
            ->assertJsonPath('code', 500);
    }

    public function test_again_task_retries_all_errors(): void
    {
        Queue::fake();
        $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $this->createTask();

        $this->withSqmusicToken()
            ->getJson('/api/task/againTask')
            ->assertOk()
            ->assertJsonPath('code', 200);

        $this->assertSame(0, DownloadTask::query()->where('status', 'error')->count());
        Queue::assertPushed(DownloadSongJob::class, 2);
    }

    public function test_bulk_delete_by_status(): void
    {
        $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $this->createTask(['status' => DownloadTask::STATUS_SUCCESS]);
        $success2 = $this->createTask(['status' => DownloadTask::STATUS_SUCCESS]);
        $this->createTask();

        $res = $this->withSqmusicToken()->getJson('/api/task/delSuccessTask');
        $res->assertOk()->assertJsonPath('code', 200)->assertJsonPath('data.count', 2);
        $this->assertDatabaseMissing('download_tasks', ['id' => $success2->id]);

        $this->withSqmusicToken()->getJson('/api/task/delErrorTask')
            ->assertOk()->assertJsonPath('data.count', 1);

        $this->withSqmusicToken()->getJson('/api/task/delWaitingTask')
            ->assertOk()->assertJsonPath('data.count', 1);

        $this->assertDatabaseCount('download_tasks', 0);
    }

    public function test_requires_sqmusic_token(): void
    {
        $this->postJson('/api/task/list')->assertStatus(403)->assertJsonPath('code', 403);
    }
}
