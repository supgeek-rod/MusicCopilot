<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GetLyricTest extends TestCase
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

    public function test_returns_lrc_text_in_data(): void
    {
        Http::fake([
            'newlyric.kuwo.cn/*' => Http::response($this->fakeLyricPayload("[00:01.00]晴天\n[00:02.00]故事的小黄花")),
        ]);

        $response = $this->withSqmusicToken()
            ->postJson('/api/music/getLyric', ['id' => '228908', 'plugName' => 'kw']);

        $response->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('msg', null)
            ->assertJsonPath('data', "[00:01.00]晴天\n[00:02.00]故事的小黄花");
    }

    public function test_retries_error_node_then_succeeds(): void
    {
        Http::fake([
            'newlyric.kuwo.cn/*' => Http::sequence()
                ->push('tp=error'."\r\n\r\n".'TP=ERROR REQUEST')
                ->push($this->fakeLyricPayload('[00:01.00]ok')),
        ]);

        $response = $this->withSqmusicToken()
            ->postJson('/api/music/getLyric', ['id' => '1', 'plugName' => 'kw']);

        $response->assertOk()->assertJsonPath('code', 200)->assertJsonPath('data', '[00:01.00]ok');
    }

    public function test_gives_up_after_repeated_error_nodes(): void
    {
        Http::fake([
            'newlyric.kuwo.cn/*' => Http::response('tp=error'."\r\n\r\n".'TP=ERROR REQUEST'),
        ]);

        $response = $this->withSqmusicToken()
            ->postJson('/api/music/getLyric', ['id' => '1', 'plugName' => 'kw']);

        $response->assertOk()->assertJsonPath('code', 500);
        Http::assertSentCount(3);
    }

    public function test_unknown_plugin_fails(): void
    {
        $response = $this->withSqmusicToken()
            ->postJson('/api/music/getLyric', ['id' => '1', 'plugName' => 'xx']);

        $response->assertOk()->assertJsonPath('code', 500);
    }

    public function test_missing_id_fails_with_contract_envelope(): void
    {
        $response = $this->withSqmusicToken()
            ->postJson('/api/music/getLyric', ['plugName' => 'kw']);

        $response->assertOk()->assertJsonPath('code', 500);
    }

    public function test_requires_sqmusic_token(): void
    {
        $response = $this->postJson('/api/music/getLyric', ['id' => '1', 'plugName' => 'kw']);

        $response->assertStatus(403)->assertJsonPath('code', 403);
    }
}
