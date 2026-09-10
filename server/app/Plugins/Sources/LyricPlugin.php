<?php

namespace App\Plugins\Sources;

/**
 * 歌词能力接口：支持歌词的音源插件与 SourcePlugin 一并实现，
 * 控制器以 instanceof 探测，未实现歌词能力的插件不做歌词路由。
 */
interface LyricPlugin
{
    /**
     * 获取歌词（LRC 文本）；无歌词或获取失败返回 null
     */
    public function getLyric(string $songId): ?string;
}
