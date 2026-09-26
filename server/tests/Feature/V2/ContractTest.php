<?php

namespace Tests\Feature\V2;

use Tests\TestCase;

/**
 * API V2 错误契约横切验证：未知路由 404、方法不允许 405、
 * 健康检查保留历史信封形态（Docker healthcheck 与前端探活依赖）。
 */
class ContractTest extends TestCase
{
    public function test_unknown_v2_route_returns_404_error_body(): void
    {
        $this->getJson('/api/v2/nonexistent')
            ->assertStatus(404)
            ->assertJsonPath('error', 'not_found');
    }

    public function test_method_not_allowed_returns_405_error_body(): void
    {
        $this->getJson('/api/v2/downloads/songs')
            ->assertStatus(405)
            ->assertJsonPath('error', 'method_not_allowed');
    }

    public function test_healthcheck_keeps_legacy_envelope(): void
    {
        // 探活端点不随 V2 迁移：{code,msg,data} 信封保留，避免破坏 healthcheck 消费方
        $this->getJson('/api/healthcheck')
            ->assertOk()
            ->assertJsonPath('code', 200);
    }
}
