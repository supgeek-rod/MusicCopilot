import type { AppConfig } from '@/api/types'

const OVERRIDE_KEY = 'music-copilot:config-override'

/** 设置面板可编辑的连接三要素（留空字段表示跟随 config.json 的默认值） */
export interface ConnectionConfig {
  baseUrl: string
  username: string
  password: string
}

/** 读取本设备覆盖配置（仅含显式设置的字段，优先于 config.json 文件），缺失或损坏时返回 null */
export function loadConfigOverride(): AppConfig | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY)
    const obj = raw ? (JSON.parse(raw) as unknown) : null
    if (!obj || typeof obj !== 'object') return null
    const o = obj as Record<string, unknown>
    const out: AppConfig = {}
    if (typeof o.baseUrl === 'string') out.baseUrl = o.baseUrl
    if (typeof o.username === 'string') out.username = o.username
    if (typeof o.password === 'string') out.password = o.password
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

/** 持久化本设备覆盖配置：空串 / 未提供的字段不落盘，表示跟随 config.json 的默认值 */
export function saveConfigOverride(cfg: Partial<ConnectionConfig>): void {
  const clean: Partial<Record<keyof ConnectionConfig, string>> = {}
  for (const key of ['baseUrl', 'username', 'password'] as const) {
    const v = cfg[key]
    if (typeof v === 'string' && v !== '') clean[key] = v
  }
  try {
    if (Object.keys(clean).length) localStorage.setItem(OVERRIDE_KEY, JSON.stringify(clean))
    else localStorage.removeItem(OVERRIDE_KEY)
  } catch {
    // 存储不可用（隐私模式等）时静默放弃，仅保留本次会话内生效
  }
}

export function clearConfigOverride(): void {
  try {
    localStorage.removeItem(OVERRIDE_KEY)
  } catch {
    // 同上
  }
}

/** 合并文件配置与本设备覆盖层：覆盖层的字段（含显式清空的空串）始终优先 */
export function mergeConfig(base: AppConfig | null, override: AppConfig | null): AppConfig {
  return { ...(base ?? {}), ...(override ?? {}) }
}
