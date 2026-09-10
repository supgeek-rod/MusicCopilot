<?php

namespace App\Plugins\Sources\Kuwo;

use App\Plugins\Sources\SourcePlugin;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * 酷我音乐音源插件。
 * 端点调研结论见仓库 docs/kuwo-api-notes.md：
 * 搜索走 search.kuwo.cn/r.s（ft=music|artist|album），pn 从 0 开始；
 * 音质清单来自 N_MINFO/MINFO，仅五个明文 br 可用于后续直链解析。
 */
class KuwoPlugin implements SourcePlugin
{
    public function plugName(): string
    {
        return 'kw';
    }

    public function searchSong(string $keyword, int $pageIndex, int $pageSize): array
    {
        $json = $this->search($keyword, $pageIndex, $pageSize, 'music');

        return [
            'records' => array_map($this->mapSong(...), $json['abslist'] ?? []),
            'total' => (int) ($json['TOTAL'] ?? 0),
        ];
    }

    public function searchArtist(string $keyword, int $pageIndex, int $pageSize): array
    {
        $json = $this->search($keyword, $pageIndex, $pageSize, 'artist');

        return [
            'records' => array_map($this->mapArtist(...), $json['abslist'] ?? []),
            'total' => (int) ($json['TOTAL'] ?? 0),
        ];
    }

    public function searchAlbum(string $keyword, int $pageIndex, int $pageSize): array
    {
        $json = $this->search($keyword, $pageIndex, $pageSize, 'album');

        // 专辑搜索响应没有 TOTAL，用 SHOW（本页返回数）兜底
        $total = (int) ($json['TOTAL'] ?? $json['SHOW'] ?? count($json['albumlist'] ?? []));

        return [
            'records' => array_map($this->mapAlbum(...), $json['albumlist'] ?? []),
            'total' => $total,
        ];
    }

    private function search(string $keyword, int $pageIndex, int $pageSize, string $type): array
    {
        $response = Http::timeout((int) config('kuwo.timeout'))
            ->withHeaders(['User-Agent' => (string) config('kuwo.user_agent')])
            ->get((string) config('kuwo.search_url'), [
                'client' => 'kt',
                'encoding' => 'utf8',
                'rformat' => 'json',
                'mobi' => '1',
                'vipver' => '1',
                'pn' => max(0, $pageIndex - 1),
                'rn' => $pageSize,
                'correct' => '1',
                'all' => $keyword,
                'ft' => $type,
            ]);

        if ($response->failed()) {
            throw new RuntimeException('酷我接口 HTTP '.$response->status());
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new RuntimeException('酷我接口返回非 JSON 数据');
        }

        return $json;
    }

    /** 字段契约对齐前端 SongRecord（MusicCopilot src/api/types.ts） */
    private function mapSong(array $e): array
    {
        return [
            'id' => preg_replace('/^MUSIC_/', '', (string) ($e['MUSICRID'] ?? '')),
            'name' => (string) ($e['NAME'] ?? ''),
            'artistName' => $this->splitAmp((string) ($e['ARTIST'] ?? '')),
            'artistids' => $this->splitAmp((string) ($e['allartistid'] ?? '')),
            'pic' => $this->picOf(
                (string) ($e['web_albumpic_short'] ?? ''),
                (string) ($e['web_artistpic_short'] ?? ''),
            ),
            'albumName' => (string) ($e['ALBUM'] ?? '') !== '' ? $e['ALBUM'] : null,
            'albumid' => $this->albumidOf($e),
            'lyric' => null,
            'lyricId' => null,
            'plugName' => $this->plugName(),
            // SQMusic 契约为毫秒（字符串）
            'duration' => (string) ((int) ($e['DURATION'] ?? 0) * 1000),
            'brTypes' => $this->brTypesFromMinfo((string) ($e['N_MINFO'] ?? $e['MINFO'] ?? '')),
            'dataInfo' => $e,
        ];
    }

    /** 字段契约对齐前端 ArtistRecord */
    private function mapArtist(array $e): array
    {
        return [
            'artistName' => (string) ($e['ARTIST'] ?? ''),
            'artistid' => (string) ($e['ARTISTID'] ?? ''),
            // hts_PICPATH 为绝对地址（/240/ 规格），PICPATH 为相对路径
            'pic' => $this->artistPicOf(
                (string) ($e['hts_PICPATH'] ?? ''),
                (string) ($e['PICPATH'] ?? ''),
            ),
            'plugName' => $this->plugName(),
            // 专辑数量，契约里为字符串数字
            'total' => (string) ($e['ALBUMNUM'] ?? ''),
            'dataInfo' => $e,
        ];
    }

    /** 字段契约对齐前端 AlbumRecord */
    private function mapAlbum(array $e): array
    {
        return [
            'albumName' => (string) ($e['name'] ?? ''),
            'albumid' => (string) ($e['albumid'] ?? ''),
            'artistName' => ($e['artist'] ?? '') !== '' ? $e['artist'] : null,
            'artistid' => ($e['artistid'] ?? '') !== '' ? $e['artistid'] : null,
            'pic' => isset($e['pic'])
                ? $this->coverSize((string) config('kuwo.song_cover_url').$e['pic'])
                : null,
            'plugName' => $this->plugName(),
            'total' => $e['musiccnt'] ?? null,
            'dataInfo' => $e,
        ];
    }

    /** MINFO/N_MINFO（"level:h,bitrate:128,format:mp3,size:..." ; 分隔）→ 明文音质 brType 列表 */
    private function brTypesFromMinfo(string $minfo): array
    {
        $types = [];

        foreach (explode(';', $minfo) as $part) {
            $kv = [];
            foreach (explode(',', $part) as $pair) {
                $bits = explode(':', $pair, 2);
                if (count($bits) === 2) {
                    $kv[trim($bits[0])] = trim($bits[1]);
                }
            }

            $format = strtolower($kv['format'] ?? '');
            $bitrate = (int) ($kv['bitrate'] ?? 0);

            $id = match (true) {
                $format === 'mp3' && $bitrate === 128 => 'KW_MP3_128',
                $format === 'mp3' && $bitrate === 192 => 'KW_MP3_192',
                $format === 'mp3' && $bitrate === 320 => 'KW_MP3_320',
                $format === 'ape' => 'KW_APE_1000',
                $format === 'flac' => 'KW_FLAC_2000',
                // mgg/mflac/zp 等加密会员格式不可解析直链，跳过
                default => null,
            };

            if ($id !== null) {
                $types[$id] = true;
            }
        }

        return array_keys($types);
    }

    /** 歌手名/ID 按多歌手分隔符 & 拆分，去空 */
    private function splitAmp(string $value): array
    {
        return array_values(array_filter(
            array_map('trim', explode('&', $value)),
            fn (string $s) => $s !== '',
        ));
    }

    private function albumidOf(array $e): ?string
    {
        $albumid = (string) ($e['ALBUMID'] ?? '');

        return ($albumid !== '' && $albumid !== '0') ? $albumid : null;
    }

    /** 歌曲封面：优先专辑图，无专辑（如单曲）时退歌手图 */
    private function picOf(string $albumPicShort, string $artistPicShort): ?string
    {
        if ($albumPicShort !== '') {
            return $this->coverSize((string) config('kuwo.song_cover_url').$albumPicShort);
        }

        if ($artistPicShort !== '') {
            return $this->coverSize((string) config('kuwo.artist_pic_url').$artistPicShort);
        }

        return null;
    }

    /** 歌手头像：优先绝对地址 hts_PICPATH，否则 BASEPICPATH 前缀 + PICPATH；/120|/240 换 /500 取大图 */
    private function artistPicOf(string $htsPic, string $relPic): ?string
    {
        $url = $htsPic !== ''
            ? $htsPic
            : (($relPic !== '') ? (string) config('kuwo.artist_pic_url').$relPic : '');

        return $url !== '' ? $this->coverSize($url) : null;
    }

    /** 封面相对路径拼前缀后把 /120 换成 /500 取大图 */
    private function coverSize(string $url): string
    {
        return str_replace(['/120', '/240'], '/500', $url);
    }
}
