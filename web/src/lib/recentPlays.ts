import type { SongRecord } from '@/api/types'

const STORAGE_KEY = 'music-copilot:recent-plays'
const MAX_ITEMS = 20

function isValidSong(v: unknown): v is SongRecord {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<SongRecord>
  return (
    typeof s.id === 'string' && s.id.length > 0 &&
    typeof s.name === 'string' &&
    typeof s.plugName === 'string' && s.plugName.length > 0
  )
}

/** 读取本地最近播放（最新在前），缺失或损坏时返回空数组 */
export function loadRecentPlays(): SongRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(data) ? data.filter(isValidSong) : []
  } catch {
    return []
  }
}

/** 记录一次播放：去重置顶、截断上限，存储不可用时静默放弃 */
export function recordRecentPlay(song: SongRecord) {
  try {
    const list = loadRecentPlays().filter((s) => !(s.id === song.id && s.plugName === song.plugName))
    list.unshift(song)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
  } catch {
    // 仅保留内存态
  }
}
