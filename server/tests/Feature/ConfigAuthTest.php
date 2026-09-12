<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConfigAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_sa_token_style_info(): void
    {
        $res = $this->postJson('/api/config/login', [
            'username' => config('mc.auth.username'),
            'password' => config('mc.auth.password'),
            'device' => 'web',
        ]);

        $res->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data.tokenName', 'sqmusic')
            ->assertJsonPath('data.isLogin', true)
            ->assertJsonPath('data.loginDevice', 'web');

        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', (string) $res->json('data.tokenValue'));
        $this->assertDatabaseCount('auth_tokens', 1);
    }

    public function test_login_requires_device(): void
    {
        $res = $this->postJson('/api/config/login', [
            'username' => config('mc.auth.username'),
            'password' => config('mc.auth.password'),
        ]);

        $res->assertOk()->assertJsonPath('code', 500);
        $this->assertStringContainsString('请填写登录设备类型', (string) $res->json('msg'));
        $this->assertDatabaseCount('auth_tokens', 0);
    }

    public function test_login_rejects_wrong_password(): void
    {
        $res = $this->postJson('/api/config/login', [
            'username' => config('mc.auth.username'),
            'password' => 'wrong-password',
            'device' => 'web',
        ]);

        $res->assertOk()
            ->assertJsonPath('code', 500)
            ->assertJsonPath('msg', '用户名或密码错误');
        $this->assertDatabaseCount('auth_tokens', 0);
    }

    public function test_is_login_reports_false_without_token(): void
    {
        // SQMusic 无 token 也返回 true 的瑕疵不复制：恒 200，登录态在 data 布尔值上
        $this->getJson('/api/config/isLogin')
            ->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data', false);
    }

    public function test_is_login_reports_true_with_valid_token(): void
    {
        $this->withSqmusicToken()
            ->getJson('/api/config/isLogin')
            ->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data', true);
    }

    public function test_expired_token_is_rejected(): void
    {
        $token = $this->loginToken();

        $this->travel(8)->days();

        $this->withHeader(config('mc.auth.token_name'), $token)
            ->getJson('/api/config/isLogin')
            ->assertOk()
            ->assertJsonPath('data', false);

        $this->assertDatabaseCount('auth_tokens', 0);
    }

    public function test_protected_routes_reject_missing_or_invalid_token(): void
    {
        $this->getJson('/api/config/getOption')
            ->assertStatus(403)
            ->assertJsonPath('code', 403);

        $this->withHeader(config('mc.auth.token_name'), 'invalid-token')
            ->getJson('/api/music/searchSong?keyword=abc&plugName=kw')
            ->assertStatus(403)
            ->assertJsonPath('code', 403);
    }

    public function test_get_option_lists_registered_plugins(): void
    {
        $this->withSqmusicToken()
            ->getJson('/api/config/getOption')
            ->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data.0.label', '酷我音乐')
            ->assertJsonPath('data.0.value', 'kw');
    }

    public function test_get_plug_br_type_list_returns_kw_qualities(): void
    {
        $res = $this->withSqmusicToken()->getJson('/api/config/getPlugBrTypeList');

        $res->assertOk()->assertJsonPath('code', 200);

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertSame(
            ['KW_MP3_128', 'KW_MP3_192', 'KW_MP3_320', 'KW_APE_1000', 'KW_FLAC_2000'],
            $ids,
        );
        $this->assertSame('kw', $res->json('data.0.plugName'));
        $this->assertSame(2000, $res->json('data.4.bit'));
    }

    public function test_logout_revokes_token(): void
    {
        $token = $this->loginToken();
        $headers = [config('mc.auth.token_name') => $token];

        $this->withHeaders($headers)
            ->postJson('/api/config/logout')
            ->assertOk()
            ->assertJsonPath('code', 200);

        $this->withHeaders($headers)
            ->getJson('/api/config/isLogin')
            ->assertOk()
            ->assertJsonPath('data', false);

        $this->withHeaders($headers)
            ->getJson('/api/config/getOption')
            ->assertStatus(403);
    }
}
