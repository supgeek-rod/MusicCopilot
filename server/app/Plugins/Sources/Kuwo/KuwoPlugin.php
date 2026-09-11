<?php

namespace App\Plugins\Sources\Kuwo;

use App\Plugins\Sources\LyricPlugin;
use App\Plugins\Sources\SourcePlugin;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * 酷我音乐音源插件。
 * 端点调研结论见仓库 docs/kuwo-api-notes.md：
 * 搜索走 search.kuwo.cn/r.s（ft=music|artist|album），pn 从 0 开始；
 * 音质清单来自 N_MINFO/MINFO，仅五个明文 br 可用于后续直链解析；
 * 歌词走 newlyric 加密接口（lrcx=1），魔法参数与解密链路见 fetchLyric。
 */
class KuwoPlugin implements SourcePlugin, LyricPlugin
{
    /**
     * 对外音质枚举（getPlugBrTypeList）：id 即搜索结果 brTypes 里的值，
     * springName 为酷我 br 值（后续直链解析用），与 brTypesFromMinfo 的识别集合保持一致。
     *
     * @var list<array{id: string, value: string, type: string, bit: int, springName: string}>
     */
    private const BR_TYPES = [
        ['id' => 'KW_MP3_128', 'value' => 'KW_MP3_128', 'type' => 'MP3', 'bit' => 128, 'springName' => '128kmp3'],
        ['id' => 'KW_MP3_192', 'value' => 'KW_MP3_192', 'type' => 'MP3', 'bit' => 192, 'springName' => '192kmp3'],
        ['id' => 'KW_MP3_320', 'value' => 'KW_MP3_320', 'type' => 'MP3', 'bit' => 320, 'springName' => '320kmp3'],
        ['id' => 'KW_APE_1000', 'value' => 'KW_APE_1000', 'type' => 'APE', 'bit' => 1000, 'springName' => '1000kape'],
        ['id' => 'KW_FLAC_2000', 'value' => 'KW_FLAC_2000', 'type' => 'FLAC', 'bit' => 2000, 'springName' => '2000kflac'],
    ];

    public function plugName(): string
    {
        return 'kw';
    }

    public function label(): string
    {
        return '酷我音乐';
    }

    public function brTypeList(): array
    {
        return array_map(
            fn (array $item): array => $item + ['plugName' => $this->plugName()],
            self::BR_TYPES,
        );
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

    public function getLyric(string $songId): ?string
    {
        $songId = trim($songId);
        if ($songId === '') {
            return null;
        }

        $cacheKey = "kuwo:lyric:{$songId}";
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $lyric = $this->fetchLyric($songId);
        if ($lyric !== null && $lyric !== '') {
            Cache::put($cacheKey, $lyric, now()->addDays(7));
        }

        return $lyric;
    }

    /**
     * 酷我加密歌词接口（newlyric，仅 lrcx=1 模式实测有效）：
     * 参数 XOR "yeelion" → base64 → GET → 校验 tp=content → \r\n\r\n 分隔 →
     * zlib inflate → base64 → XOR → gb18030 解码。
     * user/requester 是魔法值不可改；服务端多节点间歇性返回 TP=ERROR REQUEST
     * （与 UA/重放无关，按时间窗口波动），退避重试。
     * 调研过程见 scripts/kw-lyric.sh 与 docs/kuwo-api-notes.md。
     */
    private function fetchLyric(string $songId): ?string
    {
        $query = rawurlencode(base64_encode($this->xorBytes(
            "user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_{$songId}&lrcx=1",
        )));
        $attempts = 3;

        for ($attempt = 1; $attempt <= $attempts; $attempt++) {
            $response = Http::timeout((int) config('kuwo.lyric_timeout'))
                ->withHeaders(['User-Agent' => (string) config('kuwo.user_agent')])
                ->get((string) config('kuwo.lyric_url').'?'.$query);

            $body = $response->body();

            if ($response->successful() && str_starts_with($body, 'tp=content')) {
                $separator = strpos($body, "\r\n\r\n");
                if ($separator === false) {
                    return null;
                }

                $inflated = @gzuncompress(substr($body, $separator + 4));
                if ($inflated === false) {
                    return null;
                }

                $decoded = base64_decode($inflated, true);
                if ($decoded === false) {
                    return null;
                }

                $lrc = trim(mb_convert_encoding($this->xorBytes($decoded), 'UTF-8', 'GB18030'));

                return $lrc !== '' ? $lrc : null;
            }

            if ($attempt < $attempts) {
                sleep($attempt * 2);
            }
        }

        return null;
    }

    /** 酷我歌词链路固定密钥的循环 XOR */
    private function xorBytes(string $data): string
    {
        $key = 'yeelion';
        $out = '';

        for ($i = 0, $len = strlen($data); $i < $len; $i++) {
            $out .= $data[$i] ^ $key[$i % strlen($key)];
        }

        return $out;
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
