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

];
