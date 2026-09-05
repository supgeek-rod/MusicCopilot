import { request } from './http'
import type { BrTypeInfo, LoginInfo, PlugOption } from './types'

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginInfo>({
      url: '/api/config/login',
      method: 'POST',
      data: { username, password, device: 'web' },
    }),

  logout: () => request<unknown>({ url: '/api/config/logout', method: 'POST' }),

  isLogin: () => request<boolean>({ url: '/api/config/isLogin', method: 'GET' }),

  getOption: () => request<PlugOption[]>({ url: '/api/config/getOption', method: 'GET' }),

  getPlugBrTypeList: () =>
    request<BrTypeInfo[]>({ url: '/api/config/getPlugBrTypeList', method: 'GET' }),
}
