<?php

namespace App\Http\Controllers\V2;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * fnOS 音乐库代持会话：POST/DELETE /api/v2/fnos/session。
 * 凭据（MC_FNOS_USERNAME/PASSWORD）仅存在于 server 配置，由本控制器代调 fnOS
 * 登录接口换取会话 token，经 HttpOnly Cookie（music-token）下发——浏览器端
 * /fnos/* 反代请求自动携带该 Cookie，但 JS 读不到密码也读不到 token 值。
 * fnOS 鉴权口径（cookie 名、SHA-256 提交、deviceId 参数）与官方前端一致。
 */
class FnosSessionController extends Controller
{
    /** music-token Cookie 有效期（天），与原前端 JS 写入的 30 天口径一致 */
    private const TOKEN_COOKIE_DAYS = 30;

    /** 代登录：无入参凭据（凭据在服务端），仅接收浏览器设备 ID（fnOS 会话区分用） */
    public function store(Request $request): JsonResponse
    {
        $baseUrl = rtrim((string) config('fnos.base_url'), '/');
        $username = (string) config('fnos.username');
        $password = (string) config('fnos.password');
        if ($baseUrl === '' || $username === '' || $password === '') {
            throw ApiException::notConfigured('fnOS 音乐库未配置（需 MC_FNOS_BASE_URL / MC_FNOS_USERNAME / MC_FNOS_PASSWORD）');
        }

        $validated = $request->validate([
            // 浏览器生成的 32 位 hex 设备 ID（原前端 getDeviceId 同口径）
            'deviceId' => 'required|string|regex:/^[0-9a-f]{32}$/',
        ]);

        try {
            $response = Http::timeout(15)->post($baseUrl.'/music/api/v1/user/password-login', [
                'username' => $username,
                'password' => hash('sha256', $password),
                'deviceId' => $validated['deviceId'],
            ]);
        } catch (Throwable $e) {
            report($e);

            throw ApiException::upstream('fnOS 网关连接失败：'.self::errorDetail($e));
        }

        if ($response->failed()) {
            throw ApiException::upstream('fnOS 登录接口 HTTP '.$response->status());
        }

        $body = $response->json();
        if (! is_array($body)) {
            throw ApiException::upstream('fnOS 登录接口返回非 JSON 数据');
        }

        $code = (int) ($body['code'] ?? -1);
        $token = (string) ($body['data']['userToken'] ?? '');
        if ($code !== 0 || $token === '') {
            throw ApiException::unauthorized('fnOS 登录失败：'.((string) ($body['msg'] ?? "code={$code}")));
        }

        // token 只经 HttpOnly Cookie 出服务端，绝不进响应体
        $cookie = Cookie::make('music-token', $token, self::TOKEN_COOKIE_DAYS * 24 * 60, '/', null, false, true, false, 'Lax');

        return response()->json([
            'user' => $body['data']['user'] ?? null,
        ])->cookie($cookie);
    }

    /** 代登出：仅清浏览器侧会话 Cookie（fnOS 侧 token 自然过期） */
    public function destroy(): Response
    {
        $cookie = Cookie::make('music-token', '', 0, '/', null, false, true, false, 'Lax');

        return response()->noContent()->cookie($cookie);
    }
}
