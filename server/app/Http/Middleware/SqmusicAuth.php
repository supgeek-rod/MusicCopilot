<?php

namespace App\Http\Middleware;

use App\Services\SqmusicTokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * SQMusic 契约鉴权：请求头名取 config('mc.auth.token_name')（sqmusic），
 * 缺失/无效/过期一律 HTTP 403 + {code:403}——前端 http.ts 以 HTTP 403 触发自动重登并重试。
 */
class SqmusicAuth
{
    public function __construct(private readonly SqmusicTokenService $tokens)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->header((string) config('mc.auth.token_name'));
        $auth = $this->tokens->resolve($token);

        if ($auth === null) {
            return response()->json([
                'code' => 403,
                'msg' => '未登录或登录已失效，请重新登录',
                'data' => null,
            ], 403);
        }

        $request->attributes->set('auth.account', $auth->account);

        return $next($request);
    }
}
