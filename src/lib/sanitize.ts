import { ref, watch } from 'vue'

/**
 * 渲染后端返回的富文本（歌手/专辑简介），限制默认高度、可展开。
 * 内容来自自有后端，仍做基础净化（去 script / on* 事件属性）。
 */
export function useSanitizedHtml(html: () => string | null | undefined) {
  const clean = ref('')

  watch(
    html,
    (v) => {
      clean.value = String(v ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    },
    { immediate: true },
  )

  return clean
}
