import { toast } from 'vue-sonner'
import type { usePlayerStore } from '@/stores/player'

type PlayerStore = ReturnType<typeof usePlayerStore>

// 当前 <audio> 元素由 PlayerBar 挂载/卸载时注册，供全局快捷键复用播放控制逻辑
let audioEl: HTMLAudioElement | null = null

export function bindAudioEl(el: HTMLAudioElement | null) {
  audioEl = el
}

/** 播放 / 暂停（与 PlayerBar 播放按钮同款逻辑），无音频元素（队列为空）时静默忽略 */
export function togglePlayback(player: PlayerStore) {
  const audio = audioEl
  if (!audio) return
  if (player.isPlaying) {
    audio.pause()
    return
  }
  // 刷新恢复的队列尚未加载音频，先重新取链再播
  if (!player.url) {
    player
      .jump(player.queueIndex)
      .catch((e) =>
        toast.error('播放失败', { description: e instanceof Error ? e.message : String(e) }),
      )
    return
  }
  audio.play().catch(() => toast.error('播放失败'))
}

/** 聚焦页面上的搜索输入框：优先导航栏快捷搜索（md+ 可见），否则搜索页主输入框 */
export function focusSearchInput() {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[data-search-input]')
  for (const input of inputs) {
    // offsetParent 为 null 表示不可见（如窄屏下隐藏的快捷搜索框）
    if (input.offsetParent) {
      input.focus()
      return true
    }
  }
  return false
}

/** 全局快捷键：空格播放/暂停、`/` 聚焦搜索；输入控件内不拦截 */
export function installKeyboardShortcuts(player: PlayerStore): () => void {
  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    ) {
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.code === 'Space') {
      e.preventDefault()
      togglePlayback(player)
    } else if (e.key === '/') {
      e.preventDefault()
      focusSearchInput()
    }
  }
  window.addEventListener('keydown', onKeydown)
  return () => window.removeEventListener('keydown', onKeydown)
}
