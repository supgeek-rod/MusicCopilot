<?php

namespace Tests\Feature\V2;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * API V2 单曲能力：/api/v2/songs/{id}/lyric、/api/v2/songs/{id}/download-url。
 * 歌词回归标准 JSON 体 {lyric}（旧契约 LRC 放 msg 的特例废除）。
 */
class SongCapabilityTest extends TestCase
{
    use RefreshDatabase;

    /** 构造酷我 newlyric 响应体：tp=content\r\n\r\n + zlib(base64(xor(gb18030(lrc)))) */
    private function fakeLyricPayload(string $lrc): string
    {
        return 'tp=content'."\r\n\r\n".gzcompress(base64_encode($this->xorGb18030($lrc)));
    }

    /** 与 KuwoPlugin::xorBytes 同链路的编码方向：UTF-8 → gb18030 → XOR */
    private function xorGb18030(string $lrc): string
    {
        $key = 'yeelion';
        $gb = mb_convert_encoding($lrc, 'GB18030', 'UTF-8');
        $out = '';

        for ($i = 0, $len = strlen($gb); $i < $len; $i++) {
            $out .= $gb[$i] ^ $key[$i % strlen($key)];
        }

        return $out;
    }

    public function test_lyric_returns_json_body(): void
    {
        Http::fake([
            'newlyric.kuwo.cn/*' => Http::response($this->fakeLyricPayload("[00:01.00]晴天\n[00:02.00]故事的小黄花")),
        ]);

        $this->getJson('/api/v2/songs/228908/lyric?plugName=kw')
            ->assertOk()
            ->assertJsonPath('lyric', "[00:01.00]晴天\n[00:02.00]故事的小黄花");
    }

    public function test_lyric_retries_error_node_then_succeeds(): void
    {
        Http::fake([
            'newlyric.kuwo.cn/*' => Http::sequence()
                ->push('tp=error'."\r\n\r\n".'TP=ERROR REQUEST')
                ->push($this->fakeLyricPayload('[00:01.00]ok')),
        ]);

        $this->getJson('/api/v2/songs/1/lyric?plugName=kw')
            ->assertOk()
            ->assertJsonPath('lyric', '[00:01.00]ok');
    }

    public function test_lyric_gives_up_after_repeated_error_nodes_returns_404(): void
    {
        Http::fake([
            'newlyric.kuwo.cn/*' => Http::response('tp=error'."\r\n\r\n".'TP=ERROR REQUEST'),
        ]);

        $this->getJson('/api/v2/songs/1/lyric?plugName=kw')
            ->assertStatus(404)
            ->assertJsonPath('error', 'not_found');
        Http::assertSentCount(3);
    }

    public function test_lyric_unknown_plugin_returns_404(): void
    {
        $this->getJson('/api/v2/songs/1/lyric?plugName=xx')
            ->assertStatus(404)
            ->assertJsonPath('error', 'not_found');
    }

    public function test_download_url_returns_ms_duration(): void
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

        $res = $this->getJson('/api/v2/songs/228908/download-url?plugName=kw&brType=KW_MP3_320');

        $res->assertOk()
            ->assertJsonPath('brType', 'KW_MP3_320')
            ->assertJsonPath('duration', 269000, '直链 duration 秒 → V2 统一毫秒')
            ->assertJsonPath('format', 'mp3');
        $this->assertStringStartsWith('http://kw-er.kuwo.cn/', (string) $res->json('url'));

        // 上游请求应带酷我 br 值（KW_* 别名双向映射）
        Http::assertSent(fn ($request) => str_contains($request->url(), 'br=320kmp3')
            && str_contains($request->url(), 'type=convert_url_with_sign')
            && str_contains($request->url(), 'rid=228908'));
    }

    public function test_download_url_region_restriction_returns_502(): void
    {
        // 海外出口返回 code:407（docs/kuwo-api-notes.md §0/§6）
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response([
                'code' => 407,
                'data' => ['format' => 'None', 'sig' => 'None', 'url' => 'None'],
                'msg' => 'copyright protection',
            ]),
        ]);

        $res = $this->getJson('/api/v2/songs/228908/download-url?plugName=kw&brType=KW_MP3_320');

        $res->assertStatus(502)
            ->assertJsonPath('error', 'upstream_error')
            ->assertJsonPath('message', '直链解析失败：上游返回 code=407（该接口有大陆 IP 区域限制，海外出口不可用）');
    }

    public function test_download_url_unknown_br_type_returns_502(): void
    {
        Http::fake([
            'mobi.kuwo.cn/*' => Http::response(['code' => 200, 'data' => ['url' => 'http://x']]),
        ]);

        $this->getJson('/api/v2/songs/228908/download-url?plugName=kw&brType=KW_OGG_192')
            ->assertStatus(502)
            ->assertJsonPath('message', '直链解析失败：不支持的音质 brType：KW_OGG_192');
    }

    public function test_download_url_missing_br_type_returns_422(): void
    {
        $this->getJson('/api/v2/songs/228908/download-url?plugName=kw')
            ->assertStatus(422)
            ->assertJsonPath('error', 'validation_failed');
    }
}
