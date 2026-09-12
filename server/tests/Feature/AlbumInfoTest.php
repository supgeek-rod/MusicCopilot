<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AlbumInfoTest extends TestCase
{
    use RefreshDatabase;

    /** 字段取自 2026-09-12 真实响应（albumid=1293，musiclist 为小写键） */
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

    public function test_maps_album_meta_and_songs(): void
    {
        Http::fake([
            '*stype=albuminfo*' => Http::response($this->fakeAlbumInfo()),
        ]);

        $response = $this->withSqmusicToken()
            ->getJson('/api/music/albumInfoById?plugName=kw&id=1293');

        $response->assertOk()
            ->assertJsonPath('code', 200)
            ->assertJsonPath('data.albumId', '1293')
            ->assertJsonPath('data.albumName', '叶惠美')
            ->assertJsonPath('data.albumTime', '2003-07-31')
            ->assertJsonPath('data.albumArtist', '周杰伦')
            ->assertJsonPath('data.albumArtistId', '336');

        $img = (string) $response->json('data.albumImg');
        $this->assertStringContainsString('/albumcover/500/', $img);

        // 曲目 1：小写键映射 + MINFO → bits + duration 秒 + track 结构化
        $response->assertJsonPath('data.musics.0.id', '238210')
            ->assertJsonPath('data.musics.0.musicName', '以父之名')
            ->assertJsonPath('data.musics.0.musicArtists', ['周杰伦'])
            ->assertJsonPath('data.musics.0.musicAlbum', '叶惠美')
            ->assertJsonPath('data.musics.0.musicDuration', 342)
            ->assertJsonPath('data.musics.0.albumId', '1293')
            ->assertJsonPath('data.musics.0.bits', ['KW_FLAC_2000', 'KW_MP3_128'])
            ->assertJsonPath('data.musics.0.artistsIds', ['336'])
            ->assertJsonPath('data.musics.0.trackNo', 1);

        $cover = (string) $response->json('data.musics.0.musicImage');
        $this->assertStringContainsString('/albumcover/500/', $cover);

        // 曲目 2：大写键 + MUSIC_ 前缀兜底
        $response->assertJsonPath('data.musics.1.id', '228908')
            ->assertJsonPath('data.musics.1.musicName', '晴天')
            ->assertJsonPath('data.musics.1.bits', ['KW_MP3_320']);
    }

    public function test_missing_id_fails_with_contract_envelope(): void
    {
        $this->withSqmusicToken()
            ->getJson('/api/music/albumInfoById?plugName=kw')
            ->assertOk()
            ->assertJsonPath('code', 500);
    }
}
