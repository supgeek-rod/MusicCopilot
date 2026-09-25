<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    // 认证已移除（2026-09-25）：所有端点公开，测试无需再登录换取 token
}
