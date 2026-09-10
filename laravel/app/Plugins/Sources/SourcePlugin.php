<?php

namespace App\Plugins\Sources;

/**
 * 音源插件统一接口：每个音乐平台一个实现（kw / netease / mg / tidal ...），
 * 控制器只依赖本接口与 SourceManager，按 plugName 路由。
 */
interface SourcePlugin
{
    /** 插件标识，即请求参数 plugName（如 kw） */
    public function plugName(): string;

    /** 搜索单曲 @return array{records: array<int, array>, total: int} */
    public function searchSong(string $keyword, int $pageIndex, int $pageSize): array;

    /** 搜索歌手 @return array{records: array<int, array>, total: int} */
    public function searchArtist(string $keyword, int $pageIndex, int $pageSize): array;

    /** 搜索专辑 @return array{records: array<int, array>, total: int} */
    public function searchAlbum(string $keyword, int $pageIndex, int $pageSize): array;
}
