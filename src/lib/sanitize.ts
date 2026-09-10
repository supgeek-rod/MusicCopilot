import { ref, watch } from 'vue'

/**
 * 渲染后端返回的富文本（歌手/专辑简介），限制默认高度、可展开。
 * 内容来自自有后端，仍做基础净化（去 script / 危险标签 / on* 事件属性 / javascript: 链接）。
 */
export function useSanitizedHtml(html: () => string | null | undefined) {
  const clean = ref('')

  watch(
    html,
    (v) => {
      clean.value = String(v ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<(iframe|object|embed|form|meta|link)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(iframe|object|embed|form|meta|link)\b[^>]*\/?>/gi, '')
        // 事件属性：覆盖带引号 / 无引号 / 反引号三种写法
        .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]*)/gi, '')
        // 危险协议链接（href / src 等）
        .replace(/\s(href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '')
    },
    { immediate: true },
  )

  return clean
}
