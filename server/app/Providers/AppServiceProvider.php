<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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
    }
}
