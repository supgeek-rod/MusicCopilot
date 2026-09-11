<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * 登录 token（sqmusic 请求头）：只落 sha256 摘要，支持注销撤销与过期清理。
 */
class AuthToken extends Model
{
    protected $fillable = ['token_hash', 'account', 'device', 'expires_at', 'last_used_at'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }
}
