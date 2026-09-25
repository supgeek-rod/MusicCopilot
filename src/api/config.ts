import { request } from './http'
import type { BrTypeInfo, PlugOption } from './types'

/** 后端探活与配置接口（/api/healthcheck、/api/config/*） */
export const configApi = {
  /** 连接探活：恒 200 + 统一信封，不承载业务语义（compose 健康检查共用） */
  healthcheck: () => request<null>({ url: '/api/healthcheck', method: 'GET' }),

  getOption: () => request<PlugOption[]>({ url: '/api/config/getOption', method: 'GET' }),

  getPlugBrTypeList: () =>
    request<BrTypeInfo[]>({ url: '/api/config/getPlugBrTypeList', method: 'GET' }),
}
