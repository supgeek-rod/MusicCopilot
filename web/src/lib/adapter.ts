import type { SongRecord } from '@/api/types'
import type { FnosTrack } from '@/api/fnosTypes'
import { fnosCoverUrl } from '@/api/fnos'

/**
 * fnOS 曲目 → SongRecord（id 即 track guid，plugName 固定 'fnos'）。
 * API V2 起统一 Song 形态覆盖搜索/专辑曲目，形态适配已不需要；
 * fnOS 本地曲目不走在线下载：brTypes 留空（音质徽章/下载按钮隐藏），
 * duration 已是毫秒无需换算。
 */
export function fnosTrackToRecord(t: FnosTrack): SongRecord {
  return {
    id: t.guid,
    name: t.title,
    artists: (t.artists ?? []).map((a) => a.name),
    artistIds: (t.artists ?? []).map((a) => a.guid),
    pic: fnosCoverUrl(t.coverId),
    albumName: t.album?.name ?? null,
    albumId: t.album?.guid ?? null,
    plugName: 'fnos',
    duration: t.duration ?? null,
    brTypes: [],
  }
}
