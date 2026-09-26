<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 无认证设计（2026-09-25 移除）下按 IP 全局限速：最小对冲内网被刷/恶意灌任务
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->ip()));

        // API V2 无信封契约（2026-09-26）：资源与集合直接输出裸数组，
        // 不套 Laravel 默认的 data 包装层（顶层的 {data: [...]} 与嵌套集合都会受影响）
        JsonResource::withoutWrapping();
    }
}
