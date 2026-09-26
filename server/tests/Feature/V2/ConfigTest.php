<?php

namespace Tests\Feature\V2;

use Tests\TestCase;

/**
 * API V2 音源配置：/api/v2/config/{options,br-types}。
 */
class ConfigTest extends TestCase
{
    public function test_options_list_registered_plugins(): void
    {
        $this->getJson('/api/v2/config/options')
            ->assertOk()
            ->assertJsonPath('0.label', '酷我音乐')
            ->assertJsonPath('0.value', 'kw');
    }

    public function test_br_types_shape_is_converged(): void
    {
        $res = $this->getJson('/api/v2/config/br-types');
        $res->assertOk();

        $first = $res->json('0');
        $this->assertSame(['id', 'type', 'bit', 'plugName'], array_keys($first), 'value/springName 冗余字段不进 V2 契约');
        $this->assertSame('kw', $first['plugName']);
        $this->assertIsInt($first['bit']);

        $ids = collect($res->json())->pluck('id')->all();
        $this->assertSame(
            ['KW_MP3_128', 'KW_MP3_192', 'KW_MP3_320', 'KW_APE_1000', 'KW_FLAC_2000'],
            $ids,
        );
    }
}
