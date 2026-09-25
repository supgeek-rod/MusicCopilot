<?php

namespace Tests\Feature;

use Tests\TestCase;

class ConfigTest extends TestCase
{
    /** 登录 / 登录态 / 注销端点已随 SqMusic 契约清理删除（2026-09-26） */
    public function test_auth_endpoints_are_gone(): void
    {
        $this->postJson('/api/config/login')->assertNotFound();
        $this->getJson('/api/config/isLogin')->assertNotFound();
        $this->postJson('/api/config/isLogin')->assertNotFound();
        $this->postJson('/api/config/logout')->assertNotFound();
    }

    /** config 端点公开可访问（认证已移除） */
    public function test_config_endpoints_are_public(): void
    {
        $this->getJson('/api/config/getOption')
            ->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data.0.label', '酷我音乐')
            ->assertJsonPath('data.0.value', 'kw');

        $res = $this->getJson('/api/config/getPlugBrTypeList');
        $res->assertOk()->assertJsonPath('code', 200);

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertSame(
            ['KW_MP3_128', 'KW_MP3_192', 'KW_MP3_320', 'KW_APE_1000', 'KW_FLAC_2000'],
            $ids,
        );
    }
}
