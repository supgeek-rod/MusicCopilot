import { defineStore } from 'pinia'
import { fnosMe, fnosRuntime, fnosServerLogin, fnosServerLogout } from '@/api/fnos'
import type { FnosAppConfig } from '@/api/types'
import { useAppStore } from './app'

/**
 * fnOS 音乐库会话：凭据由 server 代持（/api/fnos/login 换取 HttpOnly Cookie），
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
      fnosRuntime.relogin = async () => this.login()
    },

    /** 确保已登录：先探测现有 Cookie 会话，失效则静默重登（凭据在 server 侧） */
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
        // 请求层已尝试过静默重登，走到这里说明 server 未配置凭据或确实失败
        return false
      } finally {
        this.connecting = false
      }
    },

    /** 登录/重登：无需本地凭据，server 代持并下发 HttpOnly 会话 Cookie */
    async login(): Promise<boolean> {
      try {
        await fnosServerLogin()
        this.loggedIn = true
        return true
      } catch {
        return false
      }
    },

    async logout() {
      await fnosServerLogout()
      this.loggedIn = false
    },
  },
})
