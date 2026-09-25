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

  // 批量破坏性操作走 POST（2026-09-26 安全收敛）：GET 型可被任意网页 <img src> 静默触发
  /** 全部错误任务重试 */
  retryAllError: () => request<unknown>({ url: '/api/task/againTask', method: 'POST' }),

  delErrorTasks: () => request<unknown>({ url: '/api/task/delErrorTask', method: 'POST' }),
  delSuccessTasks: () => request<unknown>({ url: '/api/task/delSuccessTask', method: 'POST' }),
  delWaitingTasks: () => request<unknown>({ url: '/api/task/delWaitingTask', method: 'POST' }),
}
