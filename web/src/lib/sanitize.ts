import DOMPurify from 'dompurify'
import { ref, watch } from 'vue'

/**
 * 渲染后端返回的富文本（歌手/专辑简介），限制默认高度、可展开。
 * 内容来自上游音源 API（后端透传），不可信——必须经 DOMPurify 白名单净化，
 * 手写正则存在属性分隔符（<svg/onload>）、HTML 实体（&#106;avascript:）等绕过面。
 */
export function useSanitizedHtml(html: () => string | null | undefined) {
  const clean = ref('')

  watch(
    html,
    (v) => {
      clean.value = DOMPurify.sanitize(String(v ?? ''), {
        // 简介只用得到排版与图文，显式白名单兜底未来 DOMPurify 默认面变化
        ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'u', 's', 'p', 'br', 'hr', 'span', 'div', 'blockquote', 'ul', 'ol', 'li', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
      })
    },
    { immediate: true },
  )

  return clean
}
