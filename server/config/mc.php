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

    // 下载引擎：文件落盘目录（目标部署时指向 fnOS 音乐库目录，fnOS「音乐」扫描入库）
    'download' => [
        'dir' => env('MC_DOWNLOAD_DIR', storage_path('app/downloads')),
        // 目录布局模板（下载完成 worker 按此重排为「歌手/专辑/」结构）；空串 = 关闭平铺
        // 变量：{albumArtist} {album} {artist} {title} {year} {trackNo} {ext}
        'dir_template' => env('MC_DIR_TEMPLATE', '{albumArtist}/{album}/{title} - {albumArtist}.{ext}'),
    ],

];
