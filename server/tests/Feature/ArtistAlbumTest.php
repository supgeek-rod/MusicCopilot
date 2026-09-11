<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ArtistAlbumTest extends TestCase
{
    use RefreshDatabase;

    /** 字段取自 2026-09-12 真实响应（kw-artist.sh 336，文档见 docs/kuwo-api-notes.md §7） */
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

    public function test_maps_artist_info_and_albums(): void
    {
        Http::fake([
            '*stype=artistinfo*' => Http::response($this->fakeArtistInfo()),
            '*stype=albumlist*' => Http::response($this->fakeAlbumList()),
        ]);

        $response = $this->withSqmusicToken()
            ->getJson('/api/music/artistAlbumById?plugName=kw&id=336');

        $response->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data.id', '336')
            ->assertJsonPath('data.musicArtistsName', '周杰伦')
            ->assertJsonPath('data.musicArtistsAlias', 'Jay Chou')
            ->assertJsonPath('data.musicArtistsSex', '男')
            ->assertJsonPath('data.albums.0.albumId', '87758985')
            ->assertJsonPath('data.albums.0.albumName', '太阳之子')
            ->assertJsonPath('data.albums.0.albumTime', '2026-03-25')
            ->assertJsonPath('data.albums.0.albumArtist', '周杰伦')
            ->assertJsonPath('data.albums.1.albumId', '1293');

        // 封面统一取 /500 大图：img 绝对地址 /240→/500，pic 相对路径拼 albumcover 前缀
        $photo = (string) $response->json('data.musicArtistsPhoto');
        $this->assertStringContainsString('/starheads/500/', $photo);

        $img0 = (string) $response->json('data.albums.0.albumImg');
        $this->assertStringContainsString('/albumcover/500/', $img0);

        $img1 = (string) $response->json('data.albums.1.albumImg');
        $this->assertStringContainsString('img3.kuwo.cn/star/albumcover/500/s3s94/93/211513640.jpg', $img1);
    }

    public function test_missing_id_fails_with_contract_envelope(): void
    {
        $this->withSqmusicToken()
            ->getJson('/api/music/artistAlbumById?plugName=kw')
            ->assertOk()
            ->assertJsonPath('code', 500);
    }

    public function test_unknown_plugin_fails(): void
    {
        $this->withSqmusicToken()
            ->getJson('/api/music/artistAlbumById?plugName=xx&id=336')
            ->assertOk()
            ->assertJsonPath('code', 500);
    }
}
