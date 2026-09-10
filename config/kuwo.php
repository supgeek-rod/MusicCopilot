<?php

return [
    // 酷我搜索端点（ft=music|artist|album），无需鉴权，大陆/海外均可访问
    'search_url' => env('KUWO_SEARCH_URL', 'http://search.kuwo.cn/r.s'),

    // 封面前缀：搜索结果的 web_albumpic_short / pic 为相对路径，拼接后把 /120 换成 /500 取大图
    'song_cover_url' => env('KUWO_SONG_COVER_URL', 'https://img3.kuwo.cn/star/albumcover/'),
    'artist_pic_url' => env('KUWO_ARTIST_PIC_URL', 'https://star.kuwo.cn/star/starheads/'),

    'user_agent' => env('KUWO_USER_AGENT', 'kuwo_player/9.1.1.2'),
    'timeout' => env('KUWO_TIMEOUT', 10),
];
