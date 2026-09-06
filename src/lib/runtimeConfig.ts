import type { AppConfig } from '@/api/types'

const OVERRIDE_KEY = 'music-copilot:config-override'

/** 设置面板可编辑的连接三要素 */
export interface ConnectionConfig {
  baseUrl: string
  username: string
  password: string
}

/** 读取本设备覆盖配置（优先于 config.json 文件），缺失或损坏时返回 null */
export function loadConfigOverride(): AppConfig | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY)
    const obj = raw ? (JSON.parse(raw) as unknown) : null
    if (!obj || typeof obj !== 'object') return null
    const o = obj as Record<string, unknown>
    return {
      baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
      username: typeof o.username === 'string' ? o.username : '',
      password: typeof o.password === 'string' ? o.password : '',
    }
  } catch {
    return null
  }
}

/** 持久化本设备覆盖配置（仅连接三要素，autoLogin 等仍跟随文件） */
export function saveConfigOverride(cfg: ConnectionConfig): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(cfg))
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
