import type { AlbumDetailRecord, AlbumRecord, AlbumSong, SongRecord } from '@/api/types'

/**
 * 专辑详情返回的曲目结构与搜索接口不同（musicName/musicArtists/musicImage/
 * musicDuration 为秒/bits），统一适配为 SongRecord，复用歌曲列表/下载/播放组件。
 */
export function albumSongToRecord(s: AlbumSong): SongRecord {
  return {
    id: String(s.id),
    name: s.musicName,
    artistName: s.musicArtists ?? [],
    artistids: s.artistsIds ?? [],
    pic: s.musicImage ?? null,
    albumName: s.musicAlbum ?? null,
    albumid: s.albumId ?? null,
    plugName: s.plugName,
    duration: s.musicDuration != null ? Math.round(s.musicDuration * 1000) : null,
    brTypes: s.bits ?? [],
    dataInfo: s.dataInfo,
  }
}

/** 详情风格的专辑记录 → 搜索风格的专辑记录（downloadAlbum 需要后者） */
export function albumDetailToSearchRecord(a: AlbumDetailRecord, plugName: string): AlbumRecord {
  const d = (a.dataInfo ?? {}) as Record<string, unknown>
  return {
    albumName: a.albumName,
    albumid: String(a.albumId),
    artistName: a.albumArtist ?? (typeof d.artist === 'string' ? d.artist : null),
    artistid: a.albumArtistId ?? (typeof d.artistid === 'string' ? d.artistid : null),
    pic: a.albumImg ?? (typeof d.img === 'string' ? d.img : null),
    plugName,
    total: typeof d.musiccnt === 'string' ? Number(d.musiccnt) : null,
    dataInfo: a.dataInfo,
  }
}
