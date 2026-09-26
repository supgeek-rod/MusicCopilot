<?php

use App\Exceptions\ApiException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // withMiddleware 即使无自定义项也必须调用：框架靠它注册默认中间件组/别名，
    // 缺了会让 api 路由的 'api' 组字符串解析失败（Target class [api] does not exist）
    ->withMiddleware(function (Middleware $middleware): void {
        // api/* 全局限速（limiter 定义见 AppServiceProvider）；429 经异常渲染按契约输出
        $middleware->throttleApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // API V2 错误契约：真 HTTP 状态码 + {error, message}（error 为机器可读码）
        $exceptions->render(function (ApiException $e, Request $request) {
            return response()->json([
                'error' => $e->errorCode,
                'message' => $e->getMessage(),
            ], $e->status);
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/v2/*')) {
                return response()->json([
                    'error' => 'validation_failed',
                    'message' => collect($e->errors())->flatten()->implode('；'),
                ], 422);
            }
            // 历史 api/* 契约（healthcheck 域）：验证失败不抛 422，转 {code:500} 信封
            if ($request->is('api/*')) {
                return response()->json([
                    'code' => 500,
                    'msg' => collect($e->errors())->flatten()->implode('；'),
                    'data' => null,
                ]);
            }
        });

        // 限速 429：V2 走 {error,message}，历史域保持信封（前端 http 层读 message/msg 展示）
        $exceptions->render(function (\Illuminate\Http\Exceptions\ThrottleRequestsException $e, Request $request) {
            if ($request->is('api/v2/*')) {
                return response()->json([
                    'error' => 'too_many_requests',
                    'message' => '请求过于频繁，请稍后再试',
                ], 429);
            }
            if ($request->is('api/*')) {
                return response()->json([
                    'code' => 500,
                    'msg' => '请求过于频繁，请稍后再试',
                    'data' => null,
                ], 429);
            }
        });

        // V2：HTTP 语义异常（未知路由 404、方法不允许 405 等）统一 {error,message}
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\HttpException $e, Request $request) {
            if ($request->is('api/v2/*')) {
                $status = $e->getStatusCode();

                return response()->json([
                    'error' => match ($status) {
                        404 => 'not_found',
                        405 => 'method_not_allowed',
                        default => 'http_error',
                    },
                    'message' => $e->getMessage() !== '' ? $e->getMessage() : '请求失败（HTTP '.$status.'）',
                ], $status);
            }
        });

        // V2 兜底：未预期异常收敛为 500 internal_error（详情走 report 日志）
        $exceptions->render(function (Throwable $e, Request $request) {
            if ($request->is('api/v2/*')) {
                return response()->json([
                    'error' => 'internal_error',
                    'message' => '服务器内部错误',
                ], 500);
            }
        });
    })->create();
