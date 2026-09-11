<?php

namespace App\Services;

use App\Models\AuthToken;
use Illuminate\Support\Facades\Date;

/**
 * 登录 token 签发与校验：随机 64 位 hex 明文、库里只存 sha256 摘要，
 * 有效期对齐 SQMusic 的 604800s（7 天），支持多设备并存与注销撤销。
 */
class SqmusicTokenService
{
    /** 签发 token，返回明文（仅在登录响应中出现一次） */
    public function issue(string $account, string $device): string
    {
        $token = bin2hex(random_bytes(32));

        AuthToken::query()->create([
            'token_hash' => hash('sha256', $token),
            'account' => $account,
            'device' => $device,
            'expires_at' => Date::now()->addSeconds((int) config('mc.auth.ttl')),
        ]);

        return $token;
    }

    /** 校验请求携带的 token；无效/过期返回 null（过期记录顺手清理） */
    public function resolve(?string $token): ?AuthToken
    {
        if ($token === null || $token === '') {
            return null;
        }

        $auth = AuthToken::query()->where('token_hash', hash('sha256', $token))->first();

        if ($auth === null) {
            return null;
        }

        if ($auth->expires_at->isPast()) {
            $auth->delete();

            return null;
        }

        // last_used_at 节流写入：距上次超过 1 分钟才更新，避免每个请求都写库
        if ($auth->last_used_at === null || $auth->last_used_at->lt(Date::now()->subMinute())) {
            $auth->forceFill(['last_used_at' => Date::now()])->save();
        }

        return $auth;
    }

    /** 注销：删除对应 token 记录 */
    public function revoke(?string $token): void
    {
        if ($token === null || $token === '') {
            return;
        }

        AuthToken::query()->where('token_hash', hash('sha256', $token))->delete();
    }
}
