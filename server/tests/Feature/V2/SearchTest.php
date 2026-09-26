<?php

namespace Tests\Feature\V2;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * API V2 搜索四端点：/api/v2/search/{songs,artists,albums,tips}。
 * 契约要点：统一分页 {items,total,page,pageSize}、字符串数字 → int、真状态码错误体。
 */
class SearchTest extends TestCase
{
    use RefreshDatabase;

    /** r.s ft=music 响应（字段取自 2026-09-12 真实抓包，MINFO 转音质列表） */
    private function fakeSongSearch(): array
    {
        return [
            'TOTAL' => '6627',
            'abslist' => [
                [
                    'MUSICRID' => 'MUSIC_228908',
                    'NAME' => '晴天',
                    'ARTIST' => '周杰伦',
                    'allartistid' => '336',
                    'ALBUM' => '叶惠美',
                    'ALBUMID' => '1293',
                    'DURATION' => '269',
                    'playcnt' => '9905300',
                    'N_MINFO' => 'level:ff,bitrate:2000,format:flac,size:52.83Mb;level:h,bitrate:128,format:mp3,size:4.12Mb',
                    'web_albumpic_short' => '120/s3s94/93/211513640.jpg',
                ],
                [
                    // 多歌手（& 分隔）+ 零时长边界
                    'MUSICRID' => 'MUSIC_266028',
                    'NAME' => '千里之外',
                    'ARTIST' => '周杰伦&费玉清',
                    'allartistid' => '336&385',
                    'DURATION' => '0',
                ],
            ],
        ];
    }

    public function test_search_songs_maps_unified_page_with_int_types(): void
    {
        Http::fake([
            'search.kuwo.cn/*' => Http::response($this->fakeSongSearch()),
        ]);

        $res = $this->getJson('/api/v2/search/songs?keyword='.urlencode('晴天').'&page=2&pageSize=30');

        $res->assertOk();
        $this->assertSame(6627, $res->json('total'));
        $this->assertSame(2, $res->json('page'));
        $this->assertSame(30, $res->json('pageSize'));
        $this->assertCount(2, $res->json('items'));

        // 类型契约：id/artistIds/albumId/duration(毫秒)/playcnt 全 int
        $song = $res->json('items.0');
        $this->assertSame(228908, $song['id']);
        $this->assertSame('晴天', $song['name']);
        $this->assertSame(['周杰伦'], $song['artists']);
        $this->assertSame([336], $song['artistIds']);
        $this->assertSame(1293, $song['albumId']);
        $this->assertSame('叶惠美', $song['albumName']);
        $this->assertSame(269000, $song['duration']);
        $this->assertSame(9905300, $song['playcnt']);
        $this->assertSame(['KW_FLAC_2000', 'KW_MP3_128'], $song['brTypes']);
        $this->assertSame('kw', $song['plugName']);
        $this->assertStringContainsString('/albumcover/500/', (string) $song['pic']);
        // dataInfo 透传上游原始条目（含 N_MINFO）：下载创建的 music_info 与
        // 前端大小估算依赖它，裁剪会导致新任务大小列恒为空（D6 回归）
        $this->assertSame(
            'level:ff,bitrate:2000,format:flac,size:52.83Mb;level:h,bitrate:128,format:mp3,size:4.12Mb',
            $song['dataInfo']['N_MINFO'] ?? null,
        );

        // 多歌手拆分 + 零时长
        $second = $res->json('items.1');
        $this->assertSame(['周杰伦', '费玉清'], $second['artists']);
        $this->assertSame([336, 385], $second['artistIds']);
        $this->assertSame(0, $second['duration']);
    }

    public function test_search_artists_maps_int_ids_and_album_count(): void
    {
        Http::fake([
            'search.kuwo.cn/*' => Http::response([
                'TOTAL' => '50',
                'abslist' => [[
                    'ARTIST' => '周杰伦',
                    'ARTISTID' => '336',
                    'hts_PICPATH' => 'https://star.kuwo.cn/star/starheads/240/291211030.jpg',
                    'ALBUMNUM' => '45',
                ]],
            ]),
        ]);

        $res = $this->getJson('/api/v2/search/artists?keyword='.urlencode('周杰伦'));

        $res->assertOk()->assertJsonPath('total', 50);
        $artist = $res->json('items.0');
        $this->assertSame(336, $artist['id']);
        $this->assertSame('周杰伦', $artist['name']);
        $this->assertSame(45, $artist['albumCount']);
        $this->assertStringContainsString('/starheads/500/', (string) $artist['pic']);
    }

    public function test_search_albums_maps_int_ids_and_track_count(): void
    {
        Http::fake([
            'search.kuwo.cn/*' => Http::response([
                'albumlist' => [[
                    'albumid' => '1293',
                    'name' => '叶惠美',
                    'artist' => '周杰伦',
                    'artistid' => '336',
                    'musiccnt' => '11',
                    'pic' => '120/s3s94/93/211513640.jpg',
                ]],
            ]),
        ]);

        $res = $this->getJson('/api/v2/search/albums?keyword='.urlencode('叶惠美'));

        $res->assertOk();
        $album = $res->json('items.0');
        $this->assertSame(1293, $album['id']);
        $this->assertSame('叶惠美', $album['name']);
        $this->assertSame('周杰伦', $album['artist']);
        $this->assertSame(336, $album['artistId']);
        $this->assertSame(11, $album['trackCount']);
        $this->assertStringContainsString('/albumcover/500/', (string) $album['pic']);
    }

    public function test_search_tips_extracts_relword(): void
    {
        Http::fake([
            'kuwo.cn/openapi/*' => Http::response([
                'code' => 200,
                'data' => [
                    "RELWORD=晴天\r\nSNUM=9905300\r\nRNUM=1000\r\nTYPE=0",
                    'RELWORD=晴天周杰伦',
                    'RELWORD=',
                ],
            ]),
        ]);

        $this->getJson('/api/v2/search/tips?keyword='.urlencode('晴天'))
            ->assertOk()
            ->assertJson(['晴天', '晴天周杰伦']);
    }

    public function test_missing_keyword_returns_422_validation_failed(): void
    {
        $this->getJson('/api/v2/search/songs')
            ->assertStatus(422)
            ->assertJsonPath('error', 'validation_failed');
    }

    public function test_blank_keyword_returns_422_validation_failed(): void
    {
        // Laravel required 规则对纯空白字符串即判失败
        $this->getJson('/api/v2/search/songs?keyword='.urlencode('  '))
            ->assertStatus(422)
            ->assertJsonPath('error', 'validation_failed');
    }

    public function test_unknown_plugin_returns_404(): void
    {
        $this->getJson('/api/v2/search/songs?keyword=abc&plugName=xx')
            ->assertStatus(404)
            ->assertJsonPath('error', 'not_found');
    }

    public function test_upstream_failure_returns_502(): void
    {
        Http::fake([
            'search.kuwo.cn/*' => Http::response(['code' => 500, 'msg' => 'error'], 500),
        ]);

        $res = $this->getJson('/api/v2/search/songs?keyword=abc');

        $res->assertStatus(502)->assertJsonPath('error', 'upstream_error');
    }
}
