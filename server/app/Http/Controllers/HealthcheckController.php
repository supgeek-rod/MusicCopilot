<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/**
 * 探活端点：恒返回 200 + 统一信封，供 Docker healthcheck 与运维探测使用；
 * 不承载业务语义（登录态探活已改走本端点，/api/config/isLogin 仅为前端兼容保留）。
 */
class HealthcheckController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'code' => 200,
            'msg' => null,
            'data' => null,
        ]);
    }
}
