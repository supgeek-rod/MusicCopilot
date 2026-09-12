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

    /**
     * 搜索联想词（openapi searchKey）：data[] 内为 "RELWORD=词\r\nSNUM=...\r\n..." 多行串，取 RELWORD。
     */
    public function searchTips(string $keyword): array
    {
        $keyword = trim($keyword);
        if ($keyword === '') {
            return [];
        }

        $response = Http::timeout((int) config('kuwo.timeout'))
            ->withHeaders(['User-Agent' => (string) config('kuwo.tips_user_agent')])
            ->get((string) config('kuwo.tips_url'), [
                'key' => $keyword,
                'httpsStatus' => '1',
            ]);

        if ($response->failed()) {
            throw new RuntimeException('酷我接口 HTTP '.$response->status());
        }

        $json = $response->json();
        if (! is_array($json) || (int) ($json['code'] ?? 0) !== 200) {
            throw new RuntimeException('酷我联想词接口返回异常');
        }

        $tips = [];
        foreach ($json['data'] ?? [] as $item) {
            if (is_string($item) && preg_match('/RELWORD=([^\r\n]*)/', $item, $m) === 1 && $m[1] !== '') {
                $tips[] = $m[1];
            }
        }

        return $tips;
    }

    /**
     * 歌手详情 + 全部专辑（r.s stype=artistinfo / albumlist 两次请求聚合）。
     * 字段契约对齐前端 ArtistInfo（MusicCopilot src/api/types.ts）。
     */
    public function artistAlbum(string $artistId): array
    {
        $artistId = trim($artistId);
        if ($artistId === '') {
            throw new RuntimeException('artistid 不能为空');
        }

        $info = $this->rS([
            'stype' => 'artistinfo',
            'encoding' => 'utf8',
            'artistid' => $artistId,
            'pcjson' => '1',
        ]);
        $albums = $this->rS([
            'pn' => '0',
            // rn=10000（参考实现口径）响应过大，WSL2 NAT 链路 10s 超时都传不完；500 张专辑远超现实需求
            'rn' => '500',
            'artistid' => $artistId,
            'stype' => 'albumlist',
            'sortby' => '1',
            'alflac' => '1',
            'show_copyright_off' => '1',
            'pcmp4' => '1',
            'encoding' => 'utf8',
            'plat' => 'pc',
            'vipver' => 'MUSIC_9.1.1.2_BCS2',
            'devid' => '38668888',
            'pcjson' => '1',
        ]);

        $describe = trim((string) ($info['desc'] ?? ''));
        if ($describe === '') {
            $describe = trim((string) ($info['info'] ?? ''));
        }

        return [
            'id' => $artistId,
            'musicArtistsName' => (string) ($info['name'] ?? ''),
            'musicArtistsSex' => ($info['gender'] ?? '') !== '' ? (string) $info['gender'] : null,
            'musicArtistsPhoto' => $this->artistPicOf((string) ($info['hts_pic'] ?? ''), (string) ($info['pic'] ?? '')),
            'musicArtistsDescribe' => $describe !== '' ? $describe : null,
            'musicArtistsAlias' => ($info['aartist'] ?? '') !== '' ? (string) $info['aartist'] : null,
            'albums' => array_map($this->mapAlbumDetail(...), $albums['albumlist'] ?? []),
        ];
    }

    /**
     * 专辑详情 + 曲目列表（r.s stype=albuminfo，musiclist 与 abslist 键名大小写混杂）。
     * 字段契约对齐前端 AlbumInfo / AlbumSong。
     */
    public function albumInfo(string $albumId): array
    {
        $albumId = trim($albumId);
        if ($albumId === '') {
            throw new RuntimeException('albumid 不能为空');
        }

        $json = $this->rS([
            'pn' => '0',
            'rn' => '300',
            'albumid' => $albumId,
            'stype' => 'albuminfo',
            'show_copyright_off' => '1',
            'alflac' => '1',
            'pcmp4' => '1',
            'encoding' => 'utf8',
            'plat' => 'pc',
            'vipver' => 'MUSIC_9.1.1.2_BCS2',
            'devid' => '38668888',
            'newver' => '1',
            'pcjson' => '1',
        ]);

        return [
            'albumId' => (string) ($json['albumid'] ?? $albumId),
            'albumName' => (string) ($json['name'] ?? ''),
            'albumTime' => ($json['pub'] ?? '') !== '' ? (string) $json['pub'] : null,
            'albumDescribe' => ($json['info'] ?? '') !== '' ? (string) $json['info'] : null,
            'albumArtist' => ($json['artist'] ?? '') !== '' ? (string) $json['artist'] : null,
            'albumArtistId' => ($json['artistid'] ?? '') !== '' ? (string) $json['artistid'] : null,
            'albumImg' => $this->albumImgOf($json),
            'musics' => array_map($this->mapAlbumSong(...), $json['musiclist'] ?? []),
        ];
    }

    /**
     * 直链解析（mobi convert_url_with_sign）：KW_* 别名换酷我 br 值请求。
     * ⚠️ 该接口有大陆 IP 区域限制，海外出口返回 code:407（docs/kuwo-api-notes.md §0/§6）；
     * 直链带签名与时效，只能即用即取，不能持久化。
     */
    public function downloadUrl(string $songId, string $brType, array $brTypes = []): array
    {
        $spring = $this->brSpring($brType);
        if ($spring === null) {
            throw new RuntimeException("不支持的音质 brType：{$brType}");
        }

        $response = Http::timeout((int) config('kuwo.timeout'))
            ->withHeaders(['User-Agent' => (string) config('kuwo.mobi_user_agent')])
            ->get((string) config('kuwo.mobi_url'), [
                'f' => 'web',
                'user' => '0',
                'source' => 'kwplayer_ar_5.0.0.0_B_jiakong_vh.apk',
                'type' => 'convert_url_with_sign',
                'rid' => $songId,
                'br' => $spring,
            ]);

        if ($response->failed()) {
            throw new RuntimeException('酷我直链接口 HTTP '.$response->status());
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new RuntimeException('酷我直链接口返回非 JSON 数据');
        }

        $code = (int) ($json['code'] ?? 0);
        $url = (string) ($json['data']['url'] ?? '');
        if ($code !== 200 || $url === '' || $url === 'None') {
            $hint = $code === 407 ? '（该接口有大陆 IP 区域限制，海外出口不可用）' : '';

            throw new RuntimeException("上游返回 code={$code}{$hint}");
        }

        $format = (string) ($json['data']['format'] ?? '');

        return [
            'url' => $url,
            'brType' => $brType,
            'duration' => isset($json['data']['duration']) ? (int) $json['data']['duration'] : null,
            'format' => $format !== '' ? $format : null,
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
        return $this->rS([
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
    }

    /** r.s 详情族公共 GET（stype=albuminfo/artistinfo/albumlist 等），UA 与搜索一致 */
    private function rS(array $params): array
    {
        $response = Http::timeout((int) config('kuwo.timeout'))
            ->withHeaders(['User-Agent' => (string) config('kuwo.user_agent')])
            ->get((string) config('kuwo.search_url'), $params);

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

    /** 对外 KW_* 别名 → 酷我 br 值（直链解析请求用）；与 BR_TYPES 互为双向映射 */
    private function brSpring(string $brType): ?string
    {
        foreach (self::BR_TYPES as $item) {
            if ($item['id'] === $brType) {
                return $item['springName'];
            }
        }

        return null;
    }

    /** 字段契约对齐前端 AlbumDetailRecord（artistAlbumById.albums 元素） */
    private function mapAlbumDetail(array $e): array
    {
        return [
            'albumId' => (string) ($e['albumid'] ?? ''),
            'albumName' => (string) ($e['name'] ?? ''),
            'albumTime' => ($e['pub'] ?? '') !== '' ? (string) $e['pub'] : null,
            'albumDescribe' => ($e['info'] ?? '') !== '' ? (string) $e['info'] : null,
            'albumArtist' => ($e['artist'] ?? '') !== '' ? (string) $e['artist'] : null,
            'albumArtistId' => ($e['artistid'] ?? '') !== '' ? (string) $e['artistid'] : null,
            'albumImg' => $this->albumImgOf($e),
            'dataInfo' => $e,
        ];
    }

    /**
     * 字段契约对齐前端 AlbumSong（albumInfoById.musics 元素）。
     * musiclist 键名为小写（musicrid/name/artist/album/duration），与搜索 abslist 的大写键不同。
     */
    private function mapAlbumSong(array $e): array
    {
        $id = preg_replace('/^MUSIC_/', '', (string) ($e['musicrid'] ?? $e['MUSICRID'] ?? ''));
        if ($id === '') {
            $id = (string) ($e['id'] ?? '');
        }

        $album = (string) ($e['album'] ?? $e['ALBUM'] ?? '');
        $track = (int) ($e['track'] ?? $e['TRACK'] ?? 0);

        return [
            'id' => $id,
            'musicName' => (string) ($e['name'] ?? $e['NAME'] ?? ''),
            'musicArtists' => $this->splitAmp((string) ($e['artist'] ?? $e['ARTIST'] ?? '')),
            'musicAlbum' => $album !== '' ? $album : null,
            'musicImage' => $this->picOf(
                (string) ($e['web_albumpic_short'] ?? ''),
                (string) ($e['web_artistpic_short'] ?? ''),
            ),
            // musiclist 的 duration 为秒（SQMusic 专辑契约口径，与搜索接口的毫秒不同）
            'musicDuration' => (int) ($e['duration'] ?? $e['DURATION'] ?? 0),
            'bits' => $this->brTypesFromMinfo((string) ($e['N_MINFO'] ?? $e['MINFO'] ?? '')),
            'plugName' => $this->plugName(),
            'albumId' => isset($e['albumId']) ? (string) $e['albumId'] : (isset($e['albumid']) ? (string) $e['albumid'] : null),
            'artistsIds' => $this->splitAmp((string) ($e['allartistid'] ?? '')),
            // 曲目序号（酷我 track 字段，A1 结构化输出；0/缺失为 null）
            'trackNo' => $track > 0 ? $track : null,
            'dataInfo' => $e,
        ];
    }

    /** 专辑封面：img 为绝对地址（/240 规格），pic 为相对路径；统一取 /500 大图 */
    private function albumImgOf(array $e): ?string
    {
        if (($e['img'] ?? '') !== '') {
            return $this->coverSize((string) $e['img']);
        }

        if (($e['pic'] ?? '') !== '') {
            return $this->coverSize((string) config('kuwo.song_cover_url').$e['pic']);
        }

        return null;
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
