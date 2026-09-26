<?php

namespace Tests\Feature\V2;

use App\Jobs\DownloadSongJob;
use App\Models\DownloadTask;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * API V2 任务管理：/api/v2/downloads（REST）。
 * 批量删除经 DELETE /downloads?status=...（status=success ⚠️ 清空全部成功记录）。
 */
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

        // 不筛选：id 倒序 + 统一分页形态
        $res = $this->getJson('/api/v2/downloads?page=1&pageSize=2');
        $res->assertOk();
        $this->assertSame(3, $res->json('total'));
        $this->assertSame(1, $res->json('page'));
        $this->assertSame(2, $res->json('pageSize'));
        $items = $res->json('items');
        $this->assertCount(2, $items);
        $this->assertSame('失败任务', $items[0]['name']);

        // 状态筛选
        $res = $this->getJson('/api/v2/downloads?status=error');
        $this->assertSame(1, $res->json('total'));
        $this->assertSame('error', $res->json('items.0.status'));

        // 契约字段形状（V2 命名，无旧双前缀）
        $item = $res->json('items.0');
        $this->assertArrayHasKey('musicId', $item);
        $this->assertArrayHasKey('updatedAt', $item);
        $this->assertArrayHasKey('brTypes', $item);
        $this->assertArrayHasKey('musicInfo', $item);
        $this->assertArrayNotHasKey('downloadGid', $item, '恒空占位字段不应进入 V2 契约');
        $this->assertArrayNotHasKey('springName', $item);
        $this->assertArrayNotHasKey('audioBook', $item);
        $this->assertArrayNotHasKey('rewriteMp3tag', $item);
        $this->assertArrayNotHasKey('downloadBits', $item);
    }

    public function test_destroy_removes_single_task(): void
    {
        $task = $this->createTask();

        $this->deleteJson("/api/v2/downloads/{$task->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('download_tasks', ['id' => $task->id]);
    }

    public function test_refresh_requeues_active_task_only(): void
    {
        Queue::fake();
        $waiting = $this->createTask();
        $success = $this->createTask(['status' => DownloadTask::STATUS_SUCCESS]);
        $error = $this->createTask(['status' => DownloadTask::STATUS_ERROR]);

        $this->postJson("/api/v2/downloads/{$waiting->id}/refresh")
            ->assertOk()
            ->assertJsonPath('status', 'waiting');
        Queue::assertPushed(DownloadSongJob::class, 1);

        $this->postJson("/api/v2/downloads/{$success->id}/refresh")
            ->assertStatus(400)
            ->assertJsonPath('error', 'bad_request');

        $this->postJson("/api/v2/downloads/{$error->id}/refresh")
            ->assertStatus(400)
            ->assertJsonPath('error', 'bad_request');
    }

    public function test_retry_requeues_error_task_only(): void
    {
        Queue::fake();
        $error = $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $waiting = $this->createTask();

        $res = $this->postJson("/api/v2/downloads/{$error->id}/retry");
        $res->assertOk()->assertJsonPath('status', 'waiting');

        $error->refresh();
        $this->assertSame('waiting', $error->status);
        Queue::assertPushed(DownloadSongJob::class, 1);

        $this->postJson("/api/v2/downloads/{$waiting->id}/retry")
            ->assertStatus(400)
            ->assertJsonPath('error', 'bad_request');
    }

    public function test_refresh_and_retry_missing_task_return_404(): void
    {
        $this->postJson('/api/v2/downloads/99999/refresh')->assertStatus(404);
        $this->postJson('/api/v2/downloads/99999/retry')->assertStatus(404);
    }

    public function test_retry_all_retries_all_errors(): void
    {
        Queue::fake();
        $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $this->createTask();

        $this->postJson('/api/v2/downloads/retries')
            ->assertOk()
            ->assertJsonPath('retried', 2);

        $this->assertSame(0, DownloadTask::query()->where('status', 'error')->count());
        Queue::assertPushed(DownloadSongJob::class, 2);
    }

    public function test_batch_delete_by_status(): void
    {
        $this->createTask(['status' => DownloadTask::STATUS_ERROR]);
        $this->createTask(['status' => DownloadTask::STATUS_SUCCESS]);
        $success2 = $this->createTask(['status' => DownloadTask::STATUS_SUCCESS]);
        $this->createTask();

        $res = $this->deleteJson('/api/v2/downloads?status=success');
        $res->assertOk()->assertJsonPath('deleted', 2);
        $this->assertDatabaseMissing('download_tasks', ['id' => $success2->id]);

        $this->deleteJson('/api/v2/downloads?status=error')->assertOk()->assertJsonPath('deleted', 1);
        $this->deleteJson('/api/v2/downloads?status=waiting')->assertOk()->assertJsonPath('deleted', 1);

        $this->assertDatabaseCount('download_tasks', 0);
    }

    public function test_batch_delete_rejects_invalid_status(): void
    {
        // 进行中状态不可批量删除（含非法值走 422）
        $this->deleteJson('/api/v2/downloads?status=downloading')->assertStatus(422);
        $this->deleteJson('/api/v2/downloads?status=bogus')->assertStatus(422);
    }
}
