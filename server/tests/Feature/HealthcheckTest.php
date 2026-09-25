<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthcheckTest extends TestCase
{
    /** Docker healthcheck 与运维探测端点：恒 200 + 统一信封 */
    public function test_healthcheck_always_ok(): void
    {
        $this->getJson('/api/healthcheck')
            ->assertOk()
            ->assertJsonPath('code', 200);
    }
}
