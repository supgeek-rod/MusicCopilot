<?php

return [
    // 酷我搜索端点（ft=music|artist|album），无需鉴权，大陆/海外均可访问
    'search_url' => env('KUWO_SEARCH_URL', 'http://search.kuwo.cn/r.s'),

    // 封面前缀：搜索结果的 web_albumpic_short / pic 为相对路径，拼接后把 /120 换成 /500 取大图
    'song_cover_url' => env('KUWO_SONG_COVER_URL', 'https://img3.kuwo.cn/star/albumcover/'),
    'artist_pic_url' => env('KUWO_ARTIST_PIC_URL', 'https://star.kuwo.cn/star/starheads/'),

    'user_agent' => env('KUWO_USER_AGENT', 'kuwo_player/9.1.1.2'),
    // 30s：albumlist 每条专辑自带大段 info 简介，响应可达数百 KB，WSL2 NAT 链路 10s 传不完
    'timeout' => env('KUWO_TIMEOUT', 30),

    // 加密歌词端点（newlyric）：魔法参数与解密链路见 KuwoPlugin::fetchLyric / scripts/kw-lyric.sh
    'lyric_url' => env('KUWO_LYRIC_URL', 'http://newlyric.kuwo.cn/newlyric.lrc'),
    'lyric_timeout' => env('KUWO_LYRIC_TIMEOUT', 20),

    // 搜索联想词（openapi searchKey，RELWORD 提取），海外可用
    'tips_url' => env('KUWO_TIPS_URL', 'https://kuwo.cn/openapi/v1/www/search/searchKey'),
    'tips_user_agent' => env('KUWO_TIPS_USER_AGENT', 'Mozilla/5.0'),

    // 直链解析（mobi convert_url_with_sign）：⚠️ 大陆 IP 区域限制，海外返回 code:407（见 docs/kuwo-api-notes.md §6）
    'mobi_url' => env('KUWO_MOBI_URL', 'https://mobi.kuwo.cn/mobi.s'),
    'mobi_user_agent' => env('KUWO_MOBI_USER_AGENT', 'kwplayer_ar_5.0.0.0'),
];
