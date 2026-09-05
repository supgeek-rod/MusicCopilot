import axios, { AxiosError } from 'axios'
import type { ApiResponse } from './types'

/**
 * http 层与 Pinia store 解耦：store 在启动时把运行时信息绑进来，
 * 避免循环依赖。
 */
export interface HttpRuntime {
  /** 后端基地址，空串表示同源（走 vite 代理或同域部署） */
  apiBase: string
  getToken: () => { tokenName: string; tokenValue: string } | null
  /** 403 时用运行时配置（.env / config.json）里的账号密码自动重登 */
  relogin: () => Promise<boolean>
}

export const httpRuntime: HttpRuntime = {
  apiBase: '',
  getToken: () => null,
  relogin: async () => false,
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
  const token = httpRuntime.getToken()
  if (token?.tokenValue && cfg.headers) {
    cfg.headers[token.tokenName] = token.tokenValue
  }
  return cfg
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RetriableConfig = typeof axios.defaults & { __retried403?: boolean } & any

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const cfg = error.config as RetriableConfig | undefined
    // 登录态失效：自动重登一次并重试原请求（认证接口本身不重试，避免死循环）
    if (
      error.response?.status === 403 &&
      cfg &&
      !cfg.__retried403 &&
      !cfg.url?.includes('/api/config/')
    ) {
      cfg.__retried403 = true
      const ok = await httpRuntime.relogin()
      if (ok) return http.request(cfg)
      return Promise.reject(new ApiError('登录已失效，自动重新登录失败，请检查 .env / config.json 中的账号密码', 403))
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
