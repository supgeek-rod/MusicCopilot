<?php

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
        // api/* 全局限速（limiter 定义见 AppServiceProvider）；429 会经 shouldRenderJsonWhen 转信封
        $middleware->throttleApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // 统一错误契约：api/* 下的验证失败不抛 422，转为 {code:500,msg,data:null} 信封
        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'code' => 500,
                    'msg' => collect($e->errors())->flatten()->implode('；'),
                    'data' => null,
                ]);
            }
        });

        // 限速 429 同样转信封：前端 http 层会读 body.msg 展示（HTTP 状态保持 429 语义）
        $exceptions->render(function (\Illuminate\Http\Exceptions\ThrottleRequestsException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'code' => 500,
                    'msg' => '请求过于频繁，请稍后再试',
                    'data' => null,
                ], 429);
            }
        });
    })->create();
