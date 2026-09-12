<?php

return [

    // 鉴权：SQMusic 对齐契约（sqmusic 请求头 + 登录 device 字段），凭证经环境变量注入
    'auth' => [
        'username' => env('MC_AUTH_USERNAME', 'admin'),
        'password' => env('MC_AUTH_PASSWORD', 'admin'),
        // token 有效期（秒），默认 604800 = 7 天，对齐 SQMusic
        'ttl' => (int) env('MC_AUTH_TTL', 604800),
        'token_name' => 'sqmusic',
    ],

    // 下载引擎：文件落盘目录（目标部署时指向 fnOS 音乐库目录，由刮削工具接管写标签）
    'download' => [
        'dir' => env('MC_DOWNLOAD_DIR', storage_path('app/downloads')),
        // M4 自动刮削：下载完成后推送通知的 scraper 地址（/mc/api 前缀），
        // 空串=关闭（标签可经体检页手动补）；token 与 scraper 的 MC_SCRAPER_TOKEN 一致
        'scraper_url' => env('MC_SCRAPER_URL', ''),
        'scraper_token' => env('MC_SCRAPER_TOKEN', ''),
    ],

];
