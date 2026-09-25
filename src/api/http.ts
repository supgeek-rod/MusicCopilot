import axios, { AxiosError } from 'axios'
import type { ApiResponse } from './types'

/**
 * http 层与 Pinia store 解耦：store 在启动时把运行时信息绑进来，
 * 避免循环依赖。
 */
export interface HttpRuntime {
  /** 后端基地址，空串表示同源（走 vite 代理或同域部署） */
  apiBase: string
}

export const httpRuntime: HttpRuntime = {
  apiBase: '',
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const http = axios.create({ timeout: 30000 })

http.interceptors.request.use((cfg) => {
  cfg.baseURL = httpRuntime.apiBase
  return cfg
})

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    // 主动取消（AbortController 等）不是连接故障，不误报「无法连接后端服务」
    if (axios.isCancel(error)) {
      return Promise.reject(new ApiError('请求已取消'))
    }
    if (!error.response) {
      return Promise.reject(new ApiError('无法连接后端服务，请检查 .env / config.json 的 baseUrl 与网络'))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = error.response.data as any
    const msg: string = body?.msg || `请求失败（HTTP ${error.response.status}）`
    return Promise.reject(new ApiError(msg, error.response.status))
  },
)

/** 发起请求并解包统一响应 {code,msg,data} */
export async function request<T>(config: Parameters<typeof http.request>[0]): Promise<T> {
  const res = await http.request<ApiResponse<T>>(config)
  const body = res.data
  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code !== 200) {
      throw new ApiError(body.msg || `接口返回错误（code=${body.code}）`, res.status, body.code)
    }
    return body.data
  }
  return body as unknown as T
}
