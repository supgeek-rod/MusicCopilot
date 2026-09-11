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

    /** 插件展示名（getOption 的 label，如「酷我音乐」） */
    public function label(): string;

    /**
     * 插件可用音质枚举（getPlugBrTypeList）
     *
     * @return list<array{id: string, value: string, type: string, bit: int, plugName: string, springName: string}>
     */
    public function brTypeList(): array;

    /**
     * 搜索单曲
     *
     * @return array{records: list<array{id: string, name: string, artistName: list<string>, artistids: list<string>, pic: string|null, albumName: string|null, albumid: string|null, lyric: null, lyricId: null, plugName: string, duration: string, brTypes: list<string>, dataInfo: array<string, mixed>}>, total: int}
     */
    public function searchSong(string $keyword, int $pageIndex, int $pageSize): array;

    /**
     * 搜索歌手
     *
     * @return array{records: list<array{artistName: string, artistid: string, pic: string|null, plugName: string, total: string, dataInfo: array<string, mixed>}>, total: int}
     */
    public function searchArtist(string $keyword, int $pageIndex, int $pageSize): array;

    /**
     * 搜索专辑
     *
     * @return array{records: list<array{albumName: string, albumid: string, artistName: string|null, artistid: string|null, pic: string|null, plugName: string, total: string|null, dataInfo: array<string, mixed>}>, total: int}
     */
    public function searchAlbum(string $keyword, int $pageIndex, int $pageSize): array;
}
