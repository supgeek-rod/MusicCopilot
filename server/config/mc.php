<?php

return [

    // 认证已移除（2026-09-25）：server 不再校验登录凭证与 token；MC_API_USERNAME /
    // MC_API_PASSWORD 仅剩前端 config.json（自动登录）一途，由 web 容器生成脚本消费

    // 下载引擎：文件落盘目录（目标部署时指向 fnOS 音乐库目录，fnOS「音乐」扫描入库）
    'download' => [
        'dir' => env('MC_MUSIC_DOWNLOAD_DIR', storage_path('app/downloads')),
        // 路径布局模板（下载完成 worker 按此重排为「歌手/专辑/」结构）；空串 = 关闭平铺
        // 变量：{albumArtist} {album} {artist} {title} {year} {trackNo} {ext}
        'path_template' => env('MC_MUSIC_DOWNLOAD_PATH_TEMPLATE', '{albumArtist}/{album}/{title} - {albumArtist}.{ext}'),
    ],

];
