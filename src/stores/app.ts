import { defineStore } from 'pinia'
import { configApi } from '@/api/config'
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

export const useAppStore = defineStore('app', {
  state: () => ({
    /** config.json 文件原始内容（启动/重连时从服务端获取） */
    fileConfig: null as AppConfig | null,
    /** 设置面板保存的本设备覆盖配置，优先于文件（null 表示跟随文件） */
    localOverride: loadConfigOverride(),
    ready: false,
    connected: false,
    statusMsg: '正在加载配置...',
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
    bindHttp() {
      httpRuntime.apiBase = this.apiBase
    },

    loadMeta() {
      configApi
        .getOption()
        .then((v) => {
          // 仅保留酷我音源（kw 为搜索默认值，前端不暴露其余插件）；后端标签将「酷我」打码为「某我」，展示时还原
          this.plugOptions = (v ?? [])
            .filter((p) => p.value === 'kw')
            .map((p) => ({ ...p, label: p.label.replace('某我', '酷我') }))
        })
        .catch(() => {})
      configApi
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
     * 获取运行时配置并探测后端连通性。init 与设置面板重连共用；
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

      // 后端无认证（2026-09-25）：探活端点 /api/healthcheck 可达即连接成功
      try {
        await configApi.healthcheck()
        this.connected = true
      } catch {
        this.connected = false
      }

      if (this.connected) {
        this.statusMsg = '已连接'
        this.loadMeta()
      } else {
        this.statusMsg = '无法连接后端服务'
      }
      this.ready = true
    },

    /** 应用设置面板保存的连接配置：持久化本设备覆盖层（留空字段跟随默认值）并立即重连，返回是否连接成功 */
    async applyConnection(cfg: Partial<ConnectionConfig>): Promise<boolean> {
      saveConfigOverride(cfg)
      this.localOverride = loadConfigOverride()
      await this.connect()
      return this.connected
    },

    /** 清除本设备覆盖配置，恢复跟随 config.json 文件并重连 */
    async resetConnection() {
      clearConfigOverride()
      this.localOverride = loadConfigOverride()
      await this.connect()
    },
  },
})
