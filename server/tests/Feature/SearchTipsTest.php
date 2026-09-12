<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SearchTipsTest extends TestCase
{
    use RefreshDatabase;

    public function test_extracts_relword_from_openapi_items(): void
    {
        Http::fake([
            'kuwo.cn/openapi/*' => Http::response([
                'code' => 200,
                'data' => [
                    "RELWORD=晴天\r\nSNUM=9905300\r\nRNUM=1000\r\nTYPE=0",
                    'RELWORD=晴天周杰伦',
                    'RELWORD=',
                ],
            ]),
        ]);

        $response = $this->withSqmusicToken()
            ->getJson('/api/music/searchTips?plugName=kw&keyword='.urlencode('晴天'));

        $response->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data', ['晴天', '晴天周杰伦']);
    }

    public function test_upstream_error_maps_to_contract_envelope(): void
    {
        Http::fake([
            'kuwo.cn/openapi/*' => Http::response(['code' => 500, 'msg' => 'error'], 200),
        ]);

        $this->withSqmusicToken()
            ->getJson('/api/music/searchTips?plugName=kw&keyword=abc')
            ->assertOk()
            ->assertJsonPath('code', 500);
    }

    public function test_missing_keyword_fails_with_contract_envelope(): void
    {
        $this->withSqmusicToken()
            ->getJson('/api/music/searchTips?plugName=kw')
            ->assertOk()
            ->assertJsonPath('code', 500);
    }
}
