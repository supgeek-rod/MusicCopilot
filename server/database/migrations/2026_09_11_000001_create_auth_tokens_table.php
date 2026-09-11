<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth_tokens', function (Blueprint $table) {
            $table->id();
            // 只存 sha256 摘要，明文 token 仅在签发响应中出现一次
            $table->string('token_hash', 64)->unique();
            $table->string('account', 64);
            $table->string('device', 32)->default('web');
            $table->timestamp('expires_at');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_tokens');
    }
};
