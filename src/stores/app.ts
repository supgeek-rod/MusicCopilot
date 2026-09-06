import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { httpRuntime } from '@/api/http'
import type { AppConfig, BrTypeInfo, PlugOption } from '@/api/types'
import { loadDownloadQuality, saveDownloadQuality } from '@/lib/settings'
import {
  clearConfigOverride,
  loadConfigOverride,
  mergeConfig,
  saveConfigOverride,
  type ConnectionConfig,
} from '@/lib/runtimeConfig'

interface AuthToken {
  tokenName: string
  tokenValue: string
}

export const useAppStore = defineStore('app', {
  state: () => ({
    /** config.json 文件原始内容（启动/重连时从服务端获取） */
    fileConfig: null as AppConfig | null,
    /** 设置面板保存的本设备覆盖配置，优先于文件（null 表示跟随文件） */
    localOverride: loadConfigOverride(),
    ready: false,
    connected: false,
    loggedIn: false,
    statusMsg: '正在加载配置...',
    token: null as AuthToken | null,
    plugOptions: [] as PlugOption[],
    brTypeList: [] as BrTypeInfo[],
    /** 偏好下载音质（brType），空串表示自动选最高 */
    downloadBrType: loadDownloadQuality(),
  }),

  getters: {
    /** 文件配置 + 本设备覆盖层的生效配置（覆盖层显式清空的空串字段同样优先） */
    config(state): AppConfig {
      return mergeConfig(state.fileConfig, state.localOverride)
    },

    /** 空串表示同源：开发走 vite 代理，生产同域部署 */
    apiBase(): string {
      return (this.config?.baseUrl ?? '').trim().replace(/\/+$/, '')
    },
  },

  actions: {
    storageKey(): string {
      return `music-copilot:auth:${this.apiBase || 'same-origin'}`
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
        .then((v) => {
          // 仅保留酷我音源（kw 为搜索默认值，前端不暴露其余插件）；后端标签将「酷我」打码为「某我」，展示时还原
          this.plugOptions = (v ?? [])
            .filter((p) => p.value === 'kw')
            .map((p) => ({ ...p, label: p.label.replace('某我', '酷我') }))
        })
        .catch(() => {})
      authApi
        .getPlugBrTypeList()
        .then((v) => (this.brTypeList = v ?? []))
        .catch(() => {})
    },

    /** 设置偏好下载音质（空串表示自动选最高），立即持久化 */
    setDownloadBrType(brType: string) {
      this.downloadBrType = brType
      saveDownloadQuality(brType)
    },

    async init() {
      await this.connect()
    },

    /**
     * 获取运行时配置并连接后端。init 与设置面板重连共用；
     * 每次都重新 fetch config.json（no-store），保证「恢复跟随文件」拿到最新文件内容。
     * 运行时配置：dev/preview 由 Vite 中间件从 .env 虚拟生成（真实文件优先），
     * 生产为部署目录下的 config.json（Docker 由容器入口脚本从环境变量生成）。
     */
    async connect() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' })
        if (res.ok) this.fileConfig = (await res.json()) as AppConfig
      } catch {
        // config.json 缺失时使用空配置
      }
      if (!this.fileConfig) this.fileConfig = {}

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

    /** 应用设置面板保存的连接配置：持久化本设备覆盖层并立即重连，返回是否登录成功 */
    async applyConnection(cfg: ConnectionConfig): Promise<boolean> {
      saveConfigOverride(cfg)
      this.localOverride = loadConfigOverride()
      await this.connect()
      return this.loggedIn
    },

    /** 清除本设备覆盖配置，恢复跟随 config.json 文件并重连 */
    async resetConnection() {
      clearConfigOverride()
      this.localOverride = loadConfigOverride()
      await this.connect()
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
