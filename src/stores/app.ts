import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { httpRuntime } from '@/api/http'
import type { AppConfig, BrTypeInfo, PlugOption } from '@/api/types'

interface AuthToken {
  tokenName: string
  tokenValue: string
}

export const useAppStore = defineStore('app', {
  state: () => ({
    config: null as AppConfig | null,
    ready: false,
    connected: false,
    loggedIn: false,
    statusMsg: '正在加载配置...',
    token: null as AuthToken | null,
    plugOptions: [] as PlugOption[],
    brTypeList: [] as BrTypeInfo[],
  }),

  getters: {
    /** 空串表示同源：开发走 vite 代理，生产同域部署 */
    apiBase(state): string {
      return (state.config?.baseUrl ?? '').trim().replace(/\/+$/, '')
    },
  },

  actions: {
    storageKey(): string {
      return `musiccopilot:auth:${this.apiBase || 'same-origin'}`
    },

    loadToken() {
      // 清理项目更名前遗留的存储键
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sqmusic:')) localStorage.removeItem(key)
      }
      try {
        const raw = localStorage.getItem(this.storageKey())
        this.token = raw ? (JSON.parse(raw) as AuthToken) : null
      } catch {
        this.token = null
      }
    },

    saveToken(token: AuthToken | null) {
      this.token = token
      if (token) localStorage.setItem(this.storageKey(), JSON.stringify(token))
      else localStorage.removeItem(this.storageKey())
    },

    bindHttp() {
      httpRuntime.apiBase = this.apiBase
      httpRuntime.getToken = () => this.token
      httpRuntime.relogin = async () => {
        const { username, password } = this.config ?? {}
        if (!username) return false
        return this.login(username, password ?? '', true)
      }
    },

    loadMeta() {
      authApi
        .getOption()
        .then((v) => (this.plugOptions = v ?? []))
        .catch(() => {})
      authApi
        .getPlugBrTypeList()
        .then((v) => (this.brTypeList = v ?? []))
        .catch(() => {})
    },

    async init() {
      // 运行时配置：dev/preview 由 Vite 中间件从 .env 虚拟生成，
      // 生产为部署目录下的 config.json（Docker 由容器入口脚本从环境变量生成）
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' })
        if (res.ok) this.config = (await res.json()) as AppConfig
      } catch {
        // config.json 缺失时使用空配置
      }
      if (!this.config) this.config = {}

      this.statusMsg = '正在连接后端...'
      this.bindHttp()
      this.loadToken()

      // 仅在本地已有 token 时才校验登录态；无 token 直接走自动登录。
      // （该后端 isLogin 在无 token 时也返回 true，不能作为跳过登录的依据）
      if (this.token) {
        try {
          const ok = await authApi.isLogin()
          this.connected = true
          this.loggedIn = ok === true
          if (!ok) this.saveToken(null)
        } catch {
          this.connected = false
          this.loggedIn = false
        }
      }

      if (!this.loggedIn && this.config.autoLogin !== false && this.config.username) {
        await this.login(this.config.username, this.config.password ?? '')
      }

      if (this.loggedIn) {
        this.statusMsg = '已连接'
        this.loadMeta()
      } else if (!this.connected) {
        this.statusMsg = '无法连接后端服务'
      } else {
        this.statusMsg = '登录失败'
      }
      this.ready = true
    },

    /** silent = 由 403 拦截器静默调用，不改全局状态文案 */
    async login(username: string, password: string, silent = false): Promise<boolean> {
      try {
        const info = await authApi.login(username, password)
        if (info?.tokenValue) {
          this.saveToken({ tokenName: info.tokenName || 'sqmusic', tokenValue: info.tokenValue })
          this.connected = true
          this.loggedIn = true
          if (!silent) this.statusMsg = '已连接'
          this.loadMeta()
          return true
        }
        if (!silent) this.statusMsg = '登录失败'
        return false
      } catch (e) {
        if (!silent) {
          this.connected = false
          this.loggedIn = false
          this.statusMsg = e instanceof Error ? e.message : '登录失败'
        }
        return false
      }
    },
  },
})
