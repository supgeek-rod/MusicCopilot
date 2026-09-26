import { request } from './http'
import type { BrTypeInfo, HealthcheckBody, PlugOption } from './types'

/** 后端探活与音源配置接口（/api/healthcheck 历史信封、/api/v2/config/*） */
export const configApi = {
  /** 连接探活：恒 200 + 历史信封（compose 健康检查共用），不承载业务语义 */
  healthcheck: () => request<HealthcheckBody>({ url: '/api/healthcheck', method: 'GET' }),

  options: () => request<PlugOption[]>({ url: '/api/v2/config/options', method: 'GET' }),

  brTypes: () => request<BrTypeInfo[]>({ url: '/api/v2/config/br-types', method: 'GET' }),
}
