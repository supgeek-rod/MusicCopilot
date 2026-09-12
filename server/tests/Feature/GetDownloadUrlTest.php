<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GetDownloadUrlTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_direct_url_with_contract_shape(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 200,
                'data' => [
                    'bitrate' => 320,
                    'duration' => 269,
                    'format' => 'mp3',
                    'rid' => 228908,
                    'url' => 'http://kw-er.kuwo.cn/<sig>/<expire>/resource/M800x.mp3?bitrate$320&format$mp3',
                ],
            ]),
        ]);

        $response = $this->withSqmusicToken()->postJson('/api/music/getDownloadUrl', [
            'plugName' => 'kw',
            'id' => '228908',
            'brType' => 'KW_MP3_320',
            'brTypes' => ['KW_FLAC_2000', 'KW_MP3_320', 'KW_MP3_128'],
        ]);

        $response->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data.brType', 'KW_MP3_320')
            ->assertJsonPath('data.duration', 269)
            ->assertJsonPath('data.format', 'mp3');

        $this->assertStringStartsWith('http://kw-er.kuwo.cn/', (string) $response->json('data.url'));

        // 上游请求应带酷我 br 值（KW_* 别名双向映射）
        Http::assertSent(fn ($request) => str_contains($request->url(), 'br=320kmp3')
            && str_contains($request->url(), 'type=convert_url_with_sign')
            && str_contains($request->url(), 'rid=228908'));
    }

    public function test_region_restriction_maps_to_failure(): void
    {
        // 海外出口返回 code:407（docs/kuwo-api-notes.md §0/§6）
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 407,
                'data' => ['format' => 'None', 'sig' => 'None', 'url' => 'None'],
                'msg' => 'copyright protection',
            ]),
        ]);

        $response = $this->withSqmusicToken()->postJson('/api/music/getDownloadUrl', [
            'plugName' => 'kw',
            'id' => '228908',
            'brType' => 'KW_MP3_320',
        ]);

        $response->assertOk()
            ->assertJsonPath('code', 500)
            ->assertJsonPath('msg', '直链解析失败：上游返回 code=407（该接口有大陆 IP 区域限制，海外出口不可用）');
    }

    public function test_unknown_br_type_fails(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response(['code' => 200, 'data' => ['url' => 'http://x']]),
        ]);

        $response = $this->withSqmusicToken()->postJson('/api/music/getDownloadUrl', [
            'plugName' => 'kw',
            'id' => '228908',
            'brType' => 'KW_OGG_192',
        ]);

        $response->assertOk()
            ->assertJsonPath('code', 500)
            ->assertJsonPath('msg', '直链解析失败：不支持的音质 brType：KW_OGG_192');
    }

    public function test_missing_id_fails_with_contract_envelope(): void
    {
        $this->withSqmusicToken()
            ->postJson('/api/music/getDownloadUrl', ['plugName' => 'kw', 'brType' => 'KW_MP3_128'])
            ->assertOk()
            ->assertJsonPath('code', 500);
    }
}
