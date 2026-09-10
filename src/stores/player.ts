import { defineStore } from 'pinia'
import { fnosStreamUrl } from '@/api/fnos'
import { musicApi } from '@/api/music'
import type { SongRecord } from '@/api/types'
import { sortBrTypes } from '@/lib/format'
import {
  loadPersistedQueue,
  loadPlayMode,
  loadVolume,
  persistPlayMode,
  persistQueue,
} from '@/lib/playQueue'
import type { PlayMode } from '@/lib/playQueue'

export const usePlayerStore = defineStore('player', {
  // 启动时恢复上次退出时的队列（url 不恢复，点播放时重新取链）
  state: () => {
    const persisted = loadPersistedQueue()
    return {
      queue: persisted.queue,
      queueIndex: persisted.index,
      url: '',
      brType: '',
      /** 自增序号：切歌时触发 PlayerBar 重新加载音频 */
      playSeq: 0,
      loading: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: loadVolume(),
      /** 播放模式：loop 列表循环（默认）/ shuffle 随机播放 / stop 播完停止 */
      playMode: loadPlayMode(),
    }
  },

  getters: {
    song(state): SongRecord | null {
      return state.queue[state.queueIndex] ?? null
    },
    queuePosition(state): string {
      return state.queue.length > 1 ? `${state.queueIndex + 1}/${state.queue.length}` : ''
    },
    hasNext(state): boolean {
      if (state.queueIndex < 0) return false
      // 随机模式多于 1 首总有一首可播；循环模式总是回绕；播完停止只在还有下一首时可用
      if (state.playMode === 'shuffle') return state.queue.length > 1
      if (state.playMode === 'loop') return state.queue.length > 0
      return state.queueIndex < state.queue.length - 1
    },
    hasPrev(state): boolean {
      if (state.queueIndex < 0) return false
      if (state.playMode === 'shuffle') return state.queue.length > 1
      if (state.playMode === 'loop') return state.queue.length > 0
      return state.queueIndex > 0
    },
  },

  actions: {
    /** 播放单曲（等价于单元素队列） */
    play(song: SongRecord) {
      return this.playAll([song], 0)
    },

    /** 播放一组歌曲（如整张专辑），从 startIndex 开始（替换整个队列） */
    async playAll(songs: SongRecord[], startIndex = 0) {
      if (!songs.length) return
      this.queue = [...songs]
      this.persist()
      await this.jump(startIndex < 0 || startIndex >= songs.length ? 0 : startIndex)
    },

    /** 歌曲行「播放」：已在队列则直接切到该首，否则追加到队尾并立即播放（不替换队列） */
    async playNow(song: SongRecord) {
      const idx = this.queue.findIndex((s) => s.id === song.id && s.plugName === song.plugName)
      if (idx >= 0) return this.jump(idx)
      this.queue.push(song)
      return this.jump(this.queue.length - 1)
    },

    /** 把歌曲追加到队列末尾；当前没有播放中的歌曲时直接开始播放这首 */
    async addToQueue(song: SongRecord) {
      if (this.queueIndex < 0) return this.playAll([song], 0)
      this.queue.push(song)
      this.persist()
    },

    /** 移除队列中第 index 首；若移除的是当前播放歌曲则自动接播相邻一首 */
    async removeFromQueue(index: number) {
      if (index < 0 || index >= this.queue.length) return
      const removingCurrent = index === this.queueIndex
      this.queue.splice(index, 1)
      if (index < this.queueIndex) {
        // 当前播放歌曲不受影响，仅修正索引
        this.queueIndex--
      } else if (removingCurrent) {
        if (!this.queue.length) {
          this.stop()
          return
        }
        // 同位置接播原下一首；被移除的是最后一首时接播前一首
        await this.jump(Math.min(index, this.queue.length - 1))
        return
      }
      this.persist()
    },

    /** 切到队列中第 index 首并立即播放 */
    async jump(index: number) {
      const song = this.queue[index]
      if (!song) return
      this.queueIndex = index
      this.persist()
      this.loading = true
      try {
        if (song.plugName === 'fnos') {
          // fnOS 本地曲目：直链经同源 /fnos 反代，浏览器自动携带 music-token Cookie
          if (this.queueIndex !== index) return
          this.url = fnosStreamUrl(song.id)
          this.brType = ''
        } else {
          const brType = sortBrTypes(song.brTypes ?? [])[0] ?? ''
          const info = await musicApi.getDownloadUrl(song.plugName, song.id, brType, song.brTypes ?? [])
          // 若等待期间用户又切了歌，丢弃过期结果
          if (this.queueIndex !== index) return
          this.url = info.url
          this.brType = info.brType
        }
        this.currentTime = 0
        this.duration = 0
        this.playSeq++
      } finally {
        this.loading = false
      }
    },

    next() {
      if (!this.hasNext) return Promise.resolve()
      return this.jump(this.pickIndex('next'))
    },

    prev() {
      if (!this.hasPrev) return Promise.resolve()
      return this.jump(this.pickIndex('prev'))
    },

    /** 按播放模式计算切歌目标索引（调用前需确认 hasNext/hasPrev） */
    pickIndex(dir: 'next' | 'prev'): number {
      const len = this.queue.length
      if (this.playMode === 'shuffle' && len > 1) {
        // 随机播放：随机挑一首与当前不同的
        let idx = this.queueIndex
        while (idx === this.queueIndex) idx = Math.floor(Math.random() * len)
        return idx
      }
      if (this.playMode === 'loop') {
        return dir === 'next'
          ? (this.queueIndex + 1) % len
          : (this.queueIndex - 1 + len) % len
      }
      return dir === 'next' ? this.queueIndex + 1 : this.queueIndex - 1
    },

    setPlayMode(mode: PlayMode) {
      this.playMode = mode
      persistPlayMode(mode)
    },

    stop() {
      this.queue = []
      this.queueIndex = -1
      this.url = ''
      this.brType = ''
      this.isPlaying = false
      this.currentTime = 0
      this.duration = 0
      this.persist()
    },

    /** 队列或当前索引变更后写入 localStorage */
    persist() {
      persistQueue(this.queue, this.queueIndex)
    },
  },
})
