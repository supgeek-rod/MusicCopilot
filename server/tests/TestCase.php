<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /** 登录换取 token 并默认挂上 sqmusic 请求头（受鉴权保护接口的测试用） */
    protected function withSqmusicToken(): static
    {
        return $this->withHeader((string) config('mc.auth.token_name'), $this->loginToken());
    }

    /** 仅登录拿 token（注销/过期等需要手动控制请求头的场景） */
    protected function loginToken(): string
    {
        $res = $this->postJson('/api/config/login', [
            'username' => config('mc.auth.username'),
            'password' => config('mc.auth.password'),
            'device' => 'web',
        ]);

        $res->assertOk()->assertJsonPath('code', 200);

        return (string) $res->json('data.tokenValue');
    }
}
