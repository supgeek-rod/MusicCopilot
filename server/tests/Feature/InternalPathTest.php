<?php

namespace Tests\Feature;

use App\Models\DownloadTask;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InternalPathTest extends TestCase
{
    use RefreshDatabase;

    public function test_updates_task_file_path(): void
    {
        $task = DownloadTask::query()->create([
            'plug_name' => 'kw',
            'music_id' => '228908',
            'music_name' => '晴天',
            'br_type' => 'KW_MP3_128',
            'status' => DownloadTask::STATUS_SUCCESS,
            'file_path' => '/downloads/晴天.mp3',
            'update_time' => now(),
        ]);

        $this->postJson('/api/internal/download-task/path', [
            'taskId' => $task->id,
            'path' => '周杰伦/叶惠美 (2003)/03 - 晴天.mp3',
        ])
            ->assertOk()
            ->assertJsonPath('code', 200);

        $task->refresh();
        $this->assertSame('周杰伦/叶惠美 (2003)/03 - 晴天.mp3', $task->file_path);
    }

    public function test_rejects_traversal_and_absolute_path(): void
    {
        $task = DownloadTask::query()->create([
            'plug_name' => 'kw',
            'music_id' => '1',
            'music_name' => 'x',
            'br_type' => 'KW_MP3_128',
            'status' => DownloadTask::STATUS_SUCCESS,
            'update_time' => now(),
        ]);

        foreach (['../escape.mp3', '/abs/path.mp3', 'a/../../b.mp3'] as $bad) {
            $this->postJson('/api/internal/download-task/path', [
                'taskId' => $task->id,
                'path' => $bad,
            ])->assertOk()->assertJsonPath('code', 500);
        }

        $task->refresh();
        $this->assertNull($task->file_path);
    }

    public function test_missing_task_fails(): void
    {
        $this->postJson('/api/internal/download-task/path', [
            'taskId' => 99999,
            'path' => 'a/b.mp3',
        ])->assertOk()->assertJsonPath('code', 500);
    }
}
