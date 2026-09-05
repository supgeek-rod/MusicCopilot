import { defineStore } from 'pinia'
import { musicApi } from '@/api/music'
import type { SongRecord } from '@/api/types'
import { sortBrTypes } from '@/lib/format'

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [] as SongRecord[],
    queueIndex: -1,
    url: '',
    brType: '',
    /** 自增序号：切歌时触发 PlayerBar 重新加载音频 */
    playSeq: 0,
    loading: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
  }),

  getters: {
    song(state): SongRecord | null {
      return state.queue[state.queueIndex] ?? null
    },
    queuePosition(state): string {
      return state.queue.length > 1 ? `${state.queueIndex + 1}/${state.queue.length}` : ''
    },
    hasNext(state): boolean {
      return state.queueIndex >= 0 && state.queueIndex < state.queue.length - 1
    },
    hasPrev(state): boolean {
      return state.queueIndex > 0
    },
  },

  actions: {
    /** 播放单曲（等价于单元素队列） */
    play(song: SongRecord) {
      return this.playAll([song], 0)
    },

    /** 播放一组歌曲（如整张专辑），从 startIndex 开始 */
    async playAll(songs: SongRecord[], startIndex = 0) {
      if (!songs.length) return
      this.queue = [...songs]
      await this.jump(startIndex < 0 || startIndex >= songs.length ? 0 : startIndex)
    },

    /** 切到队列中第 index 首并立即播放 */
    async jump(index: number) {
      const song = this.queue[index]
      if (!song) return
      this.queueIndex = index
      this.loading = true
      try {
        const brType = sortBrTypes(song.brTypes ?? [])[0] ?? ''
        const info = await musicApi.getDownloadUrl(song.plugName, song.id, brType, song.brTypes ?? [])
        // 若等待期间用户又切了歌，丢弃过期结果
        if (this.queueIndex !== index) return
        this.url = info.url
        this.brType = info.brType
        this.currentTime = 0
        this.duration = 0
        this.playSeq++
      } finally {
        this.loading = false
      }
    },

    next() {
      if (this.hasNext) return this.jump(this.queueIndex + 1)
      return Promise.resolve()
    },

    prev() {
      if (this.hasPrev) return this.jump(this.queueIndex - 1)
      return Promise.resolve()
    },

    stop() {
      this.queue = []
      this.queueIndex = -1
      this.url = ''
      this.brType = ''
      this.isPlaying = false
      this.currentTime = 0
      this.duration = 0
    },
  },
})
