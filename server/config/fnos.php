<?php

return [

    // fnOS 网关直连地址（server 代持凭据完成登录用）；留空 = fnOS 音乐库接入关闭。
    // 注意与 web 容器的 MC_FNOS_BASE_URL（/fnos 反代目标）是同一个网关地址，
    // 但消费方不同：web 用于反代透传，server 用于直连登录换取会话 token。
    'base_url' => env('MC_FNOS_BASE_URL', ''),

    // 代持凭据（2026-09-26 起）：仅在服务端用于代调 fnOS 登录，换取的 token 经
    // HttpOnly Cookie 下发浏览器——密码与 token 值均不再经 config.json 下发前端。
    'username' => env('MC_FNOS_USERNAME', ''),
    'password' => env('MC_FNOS_PASSWORD', ''),

];
