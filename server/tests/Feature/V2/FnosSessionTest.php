<?php

namespace Tests\Feature\V2;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * fnOS 音乐库代持会话：POST/DELETE /api/v2/fnos/session。
 * 凭据仅存服务端，token 经 HttpOnly Cookie 下发（浏览器端 /fnos/* 反代自动携带）。
 */
class FnosSessionTest extends TestCase
{
    private const DEVICE_ID = '0123456789abcdef0123456789abcdef';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'fnos.base_url' => 'http://fnos-gw.test',
            'fnos.username' => 'admin',
            'fnos.password' => 'secret-password',
        ]);
    }

    /** 模拟 fnOS 登录成功响应（data 内含 userToken 与 user） */
    private function fakeFnosLogin(): void
    {
        Http::fake([
            'fnos-gw.test/music/api/v1/user/password-login' => Http::response([
                'code' => 0,
                'msg' => null,
                'data' => [
                    'userToken' => 'tok-secret-1',
                    'user' => ['guid' => 'u-1', 'name' => 'admin'],
                ],
            ]),
        ]);
    }

    public function test_store_proxies_credentials_and_sets_httponly_cookie(): void
    {
        $this->fakeFnosLogin();

        $res = $this->postJson('/api/v2/fnos/session', ['deviceId' => self::DEVICE_ID]);

        $res->assertOk()->assertJson([
            'user' => ['guid' => 'u-1', 'name' => 'admin'],
        ]);

        // 密码以 SHA-256 提交（与官方前端一致），deviceId 透传
        Http::assertSent(function ($request) {
            return $request['username'] === 'admin'
                && $request['password'] === hash('sha256', 'secret-password')
                && $request['deviceId'] === self::DEVICE_ID;
        });

        // token 只经 HttpOnly Cookie 下发，绝不进响应体
        $cookie = $res->getCookie('music-token', false);
        $this->assertNotNull($cookie);
        $this->assertSame('tok-secret-1', $cookie->getValue());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('/', $cookie->getPath());
        $this->assertStringNotContainsString('tok-secret-1', $res->getContent());
    }

    public function test_store_rejects_malformed_device_id_with_422(): void
    {
        $this->fakeFnosLogin();

        $res = $this->postJson('/api/v2/fnos/session', ['deviceId' => "bad'; rm -rf /"]);

        $res->assertStatus(422)->assertJsonPath('error', 'validation_failed');
        Http::assertNothingSent();
    }

    public function test_store_returns_503_without_configured_credentials(): void
    {
        config(['fnos.username' => '', 'fnos.password' => '']);

        $res = $this->postJson('/api/v2/fnos/session', ['deviceId' => self::DEVICE_ID]);

        $res->assertStatus(503)->assertJsonPath('error', 'not_configured');
        Http::assertNothingSent();
    }

    public function test_store_returns_401_when_fnos_rejects(): void
    {
        Http::fake([
            'fnos-gw.test/music/api/v1/user/password-login' => Http::response([
                'code' => 401,
                'msg' => '用户名或密码错误',
                'data' => null,
            ]),
        ]);

        $res = $this->postJson('/api/v2/fnos/session', ['deviceId' => self::DEVICE_ID]);

        $res->assertStatus(401)->assertJsonPath('error', 'unauthorized');
        $this->assertStringContainsString('用户名或密码错误', (string) $res->json('message'));
        $this->assertNull($res->getCookie('music-token', false));
    }

    public function test_store_returns_502_when_gateway_unreachable(): void
    {
        Http::fake([
            'fnos-gw.test/music/api/v1/user/password-login' => Http::response('unavailable', 500),
        ]);

        $this->postJson('/api/v2/fnos/session', ['deviceId' => self::DEVICE_ID])
            ->assertStatus(502)
            ->assertJsonPath('error', 'upstream_error');
    }

    public function test_destroy_expires_cookie(): void
    {
        $res = $this->deleteJson('/api/v2/fnos/session');

        $res->assertStatus(204);
        $cookie = $res->getCookie('music-token', false);
        $this->assertNotNull($cookie);
        $this->assertSame('', $cookie->getValue());
        $this->assertSame(0, $cookie->getExpiresTime(), '过期 Cookie 应带立即过期的 Expires');
    }
}
