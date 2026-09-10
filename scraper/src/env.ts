import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** 容器/进程环境配置：全部来自 MC_* 环境变量（镜像内约定，见 Dockerfile 与 compose） */
export interface Env {
  port: number
  musicDir: string
  dataDir: string
  /** 非空时校验请求头 x-mc-token */
  token: string
  /** 音源后端（Laravel server/）基址：搜索与歌词代理 */
  serverUrl: string
}

export function loadEnv(): Env {
  const env: Env = {
    port: Number(process.env.MC_PORT ?? 8098),
    musicDir: resolve(process.env.MC_MUSIC_DIR ?? 'music'),
    dataDir: resolve(process.env.MC_DATA_DIR ?? 'data'),
    token: process.env.MC_SCRAPER_TOKEN ?? '',
    serverUrl: (process.env.MC_SERVER_URL ?? 'http://127.0.0.1:8097').replace(/\/+$/, ''),
  }
  mkdirSync(env.dataDir, { recursive: true })
  return env
}
