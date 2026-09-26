<?php

namespace Tests\Feature\V2;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * API V2 详情端点：/api/v2/artists/{id}/albums、/api/v2/albums/{id}。
 * 专辑详情曲目为 V2 统一 Song 形态（duration 统一毫秒），前端 adapter 可删。
 */
class DetailTest extends TestCase
{
    use RefreshDatabase;

    /** r.s stype=artistinfo（字段取自 2026-09-12 真实响应，kw-artist.sh 336） */
    private function fakeArtistInfo(): array
    {
        return [
            'name' => '周杰伦',
            'aartist' => 'Jay Chou',
            'albumnum' => '45',
            'gender' => '男',
            'desc' => '周杰伦（Jay Chou），1979 年出生于台湾省新北市。',
            'hts_pic' => 'https://star.kuwo.cn/star/starheads/240/291211030.jpg',
            'pic' => '',
        ];
    }

    private function fakeAlbumList(): array
    {
        return [
            'albumlist' => [
                [
                    'albumid' => '87758985',
                    'name' => '太阳之子',
                    'pub' => '2026-03-25',
                    'musiccnt' => '13',
                    'artist' => '周杰伦',
                    'artistid' => '336',
                    'img' => 'http://img2.sycdn.kuwo.cn/star/albumcover/240/s4s86/95/3059703046.jpg',
                    'info' => '',
                ],
                [
                    'albumid' => '1293',
                    'name' => '叶惠美',
                    'pub' => '2003-07-31',
                    'artist' => '周杰伦',
                    'artistid' => '336',
                    'img' => '',
                    'pic' => '120/s3s94/93/211513640.jpg',
                ],
            ],
        ];
    }

    /** r.s stype=albuminfo（字段取自 2026-09-12 真实响应，musiclist 为小写键） */
    private function fakeAlbumInfo(): array
    {
        return [
            'albumid' => '1293',
            'name' => '叶惠美',
            'artist' => '周杰伦',
            'artistid' => '336',
            'pub' => '2003-07-31',
            'songnum' => '11',
            'info' => '⊙历经一年企划　引爆市场',
            'img' => 'http://img3.sycdn.kuwo.cn/star/albumcover/240/s3s94/93/211513640.jpg',
            'musiclist' => [
                [
                    'musicrid' => '238210',
                    'name' => '以父之名',
                    'artist' => '周杰伦',
                    'album' => '叶惠美',
                    'albumId' => 1293,
                    'duration' => '342',
                    'track' => '1',
                    'N_MINFO' => 'level:ff,bitrate:2000,format:flac,size:9.19Mb;level:h,bitrate:128,format:mp3,size:5.22Mb',
                    'web_albumpic_short' => '120/s3s94/93/211513640.jpg',
                    'allartistid' => '336',
                ],
                [
                    // 兜底路径：大写键 + MUSIC_ 前缀（部分条目可能出现）
                    'MUSICRID' => 'MUSIC_228908',
                    'NAME' => '晴天',
                    'album' => '叶惠美',
                    'duration' => '269',
                    'MINFO' => 'level:p,bitrate:320,format:mp3,size:10.29Mb',
                ],
            ],
        ];
    }

    public function test_artist_albums_maps_detail_and_albums(): void
    {
        Http::fake([
            '*stype=artistinfo*' => Http::response($this->fakeArtistInfo()),
            '*stype=albumlist*' => Http::response($this->fakeAlbumList()),
        ]);

        $res = $this->getJson('/api/v2/artists/336/albums?plugName=kw');

        $res->assertOk();
        $this->assertSame(336, $res->json('id'));
        $this->assertSame('周杰伦', $res->json('name'));
        $this->assertSame('Jay Chou', $res->json('alias'));
        $this->assertStringContainsString('/starheads/500/', (string) $res->json('photo'));

        $albums = $res->json('albums');
        $this->assertCount(2, $albums);
        $this->assertSame(87758985, $albums[0]['id']);
        $this->assertSame('太阳之子', $albums[0]['name']);
        $this->assertSame('2026-03-25', $albums[0]['publishTime']);
        $this->assertSame(13, $albums[0]['trackCount']);
        $this->assertStringContainsString('/albumcover/500/', (string) $albums[0]['pic']);
        // img 空但 pic 相对路径的专辑走 cover 前缀兜底
        $this->assertStringContainsString(
            'img3.kuwo.cn/star/albumcover/500/s3s94/93/211513640.jpg',
            (string) $albums[1]['pic'],
        );
    }

    public function test_artist_albums_unknown_plugin_returns_404(): void
    {
        $this->getJson('/api/v2/artists/336/albums?plugName=xx')
            ->assertStatus(404)
            ->assertJsonPath('error', 'not_found');
    }

    public function test_album_show_maps_meta_and_unified_songs(): void
    {
        Http::fake([
            '*stype=albuminfo*' => Http::response($this->fakeAlbumInfo()),
        ]);

        $res = $this->getJson('/api/v2/albums/1293?plugName=kw');

        $res->assertOk();
        $this->assertSame(1293, $res->json('id'));
        $this->assertSame('叶惠美', $res->json('name'));
        $this->assertSame('2003-07-31', $res->json('publishTime'));
        $this->assertSame('周杰伦', $res->json('artist'));
        $this->assertStringContainsString('/albumcover/500/', (string) $res->json('pic'));

        // 曲目为统一 Song 形态：duration 毫秒、trackNo/playcnt 结构化、无 dataInfo
        $songs = $res->json('songs');
        $this->assertCount(2, $songs);
        $this->assertSame(238210, $songs[0]['id']);
        $this->assertSame('以父之名', $songs[0]['name']);
        $this->assertSame(['周杰伦'], $songs[0]['artists']);
        $this->assertSame(342000, $songs[0]['duration'], '专辑曲目秒 → V2 统一毫秒');
        $this->assertSame(1, $songs[0]['trackNo']);
        $this->assertSame(1293, $songs[0]['albumId']);
        $this->assertSame(['KW_FLAC_2000', 'KW_MP3_128'], $songs[0]['brTypes']);
        $this->assertArrayNotHasKey('dataInfo', $songs[0]);

        // 大写键 + MUSIC_ 前缀兜底
        $this->assertSame(228908, $songs[1]['id']);
        $this->assertSame('晴天', $songs[1]['name']);
        $this->assertSame(['KW_MP3_320'], $songs[1]['brTypes']);
    }

    public function test_album_show_missing_id_returns_422(): void
    {
        // whereNumber 路由约束：非数字 id 不匹配 → 404（路由级）
        $this->getJson('/api/v2/albums/abc?plugName=kw')->assertStatus(404);
    }

    public function test_album_show_upstream_failure_returns_502(): void
    {
        Http::fake([
            '*stype=albuminfo*' => Http::response(['code' => 500], 500),
        ]);

        $this->getJson('/api/v2/albums/1293?plugName=kw')
            ->assertStatus(502)
            ->assertJsonPath('error', 'upstream_error');
    }
}
