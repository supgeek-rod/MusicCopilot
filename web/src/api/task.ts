import { request } from './http'
import type { TaskInfo, TaskList, TaskPage } from './types'

export interface TaskListParams {
  status?: TaskInfo['status'] | ''
  pageSize?: number
  page?: number
}

/** API V2 下载任务（REST）：/api/v2/downloads */
export const taskApi = {
  list: (params: TaskListParams = {}) =>
    request<TaskPage>({ url: '/api/v2/downloads', method: 'GET', params }),

  /** 删除单个任务记录（不删已落盘文件；幂等） */
  del: (id: number | string) =>
    request<void>({ url: `/api/v2/downloads/${id}`, method: 'DELETE' }),

  /** 重新入队（等待中/解析中的任务），返回更新后的任务 */
  refreshTask: (id: number | string) =>
    request<TaskInfo>({ url: `/api/v2/downloads/${id}/refresh`, method: 'POST' }),

  /** 重试失败任务，返回更新后的任务 */
  retryError: (id: number | string) =>
    request<TaskInfo>({ url: `/api/v2/downloads/${id}/retry`, method: 'POST' }),

  /** 全部失败任务重试 */
  retryAllError: () => request<{ retried: number }>({ url: '/api/v2/downloads/retries', method: 'POST' }),

  /** 批量删除某状态任务（status=success ⚠️ 清空全部成功记录；前端有确认弹窗） */
  delByStatus: (status: 'error' | 'success' | 'waiting') =>
    request<{ deleted: number }>({ url: '/api/v2/downloads', method: 'DELETE', params: { status } }),

  delErrorTasks: () => taskApi.delByStatus('error'),
  delSuccessTasks: () => taskApi.delByStatus('success'),
  delWaitingTasks: () => taskApi.delByStatus('waiting'),
}

export type { TaskList }
