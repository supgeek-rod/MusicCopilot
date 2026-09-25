import { toast } from 'vue-sonner'

// 当前运行构建的 git hash（dev 服务器或无 git 环境为 'dev'，此时不做版本检测）
const CURRENT_HASH = __BUILD_INFO__.hash

// 已提示过的线上 hash，防止 visibilitychange 反复弹同一个提示
let notifiedHash: string | null = null

/**
 * 与线上 version.json（构建时生成、nginx no-cache）比对构建 hash，
 * 不一致说明部署了新构建——PWA autoUpdate 已在后台装好新 SW，
 * 用户刷新页面即全量新资源。返回是否弹了提示。
 */
export async function checkForNewVersion(): Promise<boolean> {
  if (CURRENT_HASH === 'dev') return false
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const remote = (await res.json()) as { hash?: string }
    const hash = remote.hash ?? ''
    if (!hash || hash === CURRENT_HASH || hash === notifiedHash) return false
    notifiedHash = hash
    toast.info('发现新版本，点击刷新生效', {
      description: `构建 ${CURRENT_HASH} → ${hash}`,
      duration: Infinity,
      action: { label: '刷新', onClick: () => location.reload() },
    })
    return true
  } catch {
    return false
  }
}

/**
 * 手动修复缓存异常的兜底：卸载全部 Service Worker 并清空 Cache Storage 后刷新。
 * 用于怀疑「页面跑的还是旧版本」时的一键复位；刷新后 SW 重新注册、
 * 资源全部重新拉取（hash 文件名保证 CDN/浏览器缓存仍有效）。
 */
export async function clearServiceWorkerAndCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      await Promise.all((await caches.keys()).map((name) => caches.delete(name)))
    }
    if ('serviceWorker' in navigator) {
      await Promise.all(
        (await navigator.serviceWorker.getRegistrations()).map((reg) => reg.unregister()),
      )
    }
  } finally {
    location.reload()
  }
}
