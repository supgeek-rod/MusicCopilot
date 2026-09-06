import { defineStore } from 'pinia'
import { clearFnosTokenCookie, fnosMe, fnosPasswordLogin, fnosRuntime } from '@/api/fnos'
import type { FnosAppConfig } from '@/api/types'
import { useAppStore } from './app'

/**
 * fnOS 音乐库会话：token 经 document.cookie 写入（登录接口不返回 Set-Cookie），
 * 同源 /fnos 请求由浏览器自动携带；会话失效由 fnos.ts 请求层触发 relogin 重登。
 */
export const useFnosStore = defineStore('fnos', {
  state: () => ({
    loggedIn: false,
    connecting: false,
  }),

  getters: {
    /** config.json 的 fnos 块（未配置 MC_FNOS_BASE_URL 时 enabled=false） */
    cfg(state): FnosAppConfig {
      void state
      return useAppStore().config?.fnos ?? {}
    },
    enabled(): boolean {
      return this.cfg.enabled === true
    },
  },

  actions: {
    bindRuntime() {
      fnosRuntime.relogin = async () => {
        const { username, password } = this.cfg
        if (!username) return false
        return this.login(username, password ?? '')
      }
    },

    /** 确保已登录：先探测现有 Cookie 会话，失效则按配置静默重登 */
    async ensureLogin(): Promise<boolean> {
      if (!this.enabled) return false
      if (this.loggedIn) return true
      this.bindRuntime()
      this.connecting = true
      try {
        await fnosMe()
        this.loggedIn = true
        return true
      } catch {
        // 请求层已尝试过静默重登，走到这里说明凭据缺失或确实失败
        return false
      } finally {
        this.connecting = false
      }
    },

    async login(username: string, password: string): Promise<boolean> {
      try {
        await fnosPasswordLogin(username, password)
        this.loggedIn = true
        return true
      } catch {
        return false
      }
    },

    logout() {
      clearFnosTokenCookie()
      this.loggedIn = false
    },
  },
})
