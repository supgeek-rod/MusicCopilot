<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('download_tasks', function (Blueprint $table) {
            $table->id();
            $table->string('plug_name', 16);
            $table->string('music_id', 64);
            $table->string('music_name');
            $table->text('artist_name')->nullable();
            $table->string('album_name')->nullable();
            $table->string('album_id', 64)->nullable();
            // 指定音质（KW_* 别名），空串 = 自动选最高可用
            $table->string('br_type', 32)->default('');
            $table->json('br_types')->nullable();
            // 上游原始条目 JSON（kw 含 MINFO/N_MINFO，前端据此估算文件大小）
            $table->mediumText('music_info')->nullable();
            $table->string('status', 16)->default('waiting')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('file_path')->nullable();
            $table->text('error_msg')->nullable();
            // 契约兼容字段（SQMusic 为 aria2 gid），这里存队列任务 uuid 便于排查
            $table->string('download_gid', 64)->nullable();
            $table->timestamp('download_time')->nullable();
            $table->timestamp('update_time')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('download_tasks');
    }
};
