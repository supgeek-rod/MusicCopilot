import type { SongRecord } from '@/api/types'

const STORAGE_KEY = 'music-copilot:play-queue'
const MAX_ITEMS = 200

export interface PersistedQueue {
  queue: SongRecord[]
  index: number
}

export type PlayMode = 'loop' | 'shuffle' | 'stop'

const PLAY_MODE_KEY = 'music-copilot:play-mode'

export function isValidPlayMode(v: unknown): v is PlayMode {
  return v === 'loop' || v === 'shuffle' || v === 'stop'
}

/** 读取持久化的播放模式，缺失或损坏时回退为列表循环 */
export function loadPlayMode(): PlayMode {
  try {
    const mode = localStorage.getItem(PLAY_MODE_KEY)
    return isValidPlayMode(mode) ? mode : 'loop'
  } catch {
    return 'loop'
  }
}

/** 持久化播放模式，存储不可用时静默放弃 */
export function persistPlayMode(mode: PlayMode) {
  try {
    localStorage.setItem(PLAY_MODE_KEY, mode)
  } catch {
    // 仅保留内存态
  }
}

function isValidSong(v: unknown): v is SongRecord {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<SongRecord>
  return (
    typeof s.id === 'string' && s.id.length > 0 &&
    typeof s.name === 'string' &&
    typeof s.plugName === 'string' && s.plugName.length > 0
  )
}

/** 读取本地持久化的播放队列，缺失或损坏时返回空队列 */
export function loadPersistedQueue(): PersistedQueue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? (JSON.parse(raw) as unknown) : null
    if (!data || typeof data !== 'object') return { queue: [], index: -1 }
    const { queue, index } = data as { queue?: unknown; index?: unknown }
    const list = Array.isArray(queue) ? queue.filter(isValidSong) : []
    const idx =
      typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < list.length
        ? index
        : -1
    return { queue: list, index: idx }
  } catch {
    return { queue: [], index: -1 }
  }
}

/** 持久化播放队列与当前索引（超出上限截断尾部），存储不可用时静默放弃 */
export function persistQueue(queue: SongRecord[], index: number) {
  try {
    const list = queue.slice(0, MAX_ITEMS)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ queue: list, index: index < list.length ? index : -1 }),
    )
  } catch {
    // 仅保留内存态
  }
}
