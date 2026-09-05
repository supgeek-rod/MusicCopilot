import { request } from './http'
import type { TaskPage, TaskStatus } from './types'

export interface TaskListParams {
  downloadStatus?: TaskStatus | ''
  pageSize?: number
  pageIndex?: number
}

export const taskApi = {
  list: (params: TaskListParams = {}) =>
    request<TaskPage>({ url: '/api/task/list', method: 'POST', data: params }),

  del: (id: number | string) =>
    request<unknown>({ url: '/api/task/del', method: 'POST', data: { id } }),

  /** 重新入队（等待中/解析中的任务） */
  refreshTask: (id: number | string) =>
    request<unknown>({ url: '/api/task/refreshTask', method: 'POST', data: { id } }),

  /** 重试失败任务 */
  retryError: (id: number | string) =>
    request<unknown>({ url: '/api/task/errorTaskRetry', method: 'POST', data: { id } }),

  /** 全部错误任务重试 */
  retryAllError: () => request<unknown>({ url: '/api/task/againTask', method: 'GET' }),

  delErrorTasks: () => request<unknown>({ url: '/api/task/delErrorTask', method: 'GET' }),
  delSuccessTasks: () => request<unknown>({ url: '/api/task/delSuccessTask', method: 'GET' }),
  delWaitingTasks: () => request<unknown>({ url: '/api/task/delWaitingTask', method: 'GET' }),
}
