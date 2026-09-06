import type { AlbumDetailRecord, AlbumRecord, AlbumSong, SongRecord } from '@/api/types'
import type { FnosTrack } from '@/api/fnosTypes'
import { fnosCoverUrl } from '@/api/fnos'

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

/**
 * fnOS 曲目 → SongRecord（id 即 track guid，plugName 固定 'fnos'）。
 * fnOS 本地曲目不走在线下载：brTypes 留空（音质徽章/下载按钮隐藏），
 * 音频规格放 dataInfo 供展示；duration 已是毫秒无需换算。
 */
export function fnosTrackToRecord(t: FnosTrack): SongRecord {
  const spec = t.audioSpec ?? null
  return {
    id: t.guid,
    name: t.title,
    artistName: (t.artists ?? []).map((a) => a.name),
    artistids: (t.artists ?? []).map((a) => a.guid),
    pic: fnosCoverUrl(t.coverId),
    albumName: t.album?.name ?? null,
    albumid: t.album?.guid ?? null,
    plugName: 'fnos',
    duration: t.duration ?? null,
    brTypes: [],
    dataInfo: spec
      ? {
          codec: spec.codec ?? null,
          format: spec.format ?? null,
          bitDepth: spec.bitDepth ?? null,
          sampleRate: spec.sampleRate ?? null,
          bitrate: spec.bitrate ?? null,
          size: spec.size ?? null,
        }
      : undefined,
  }
}
