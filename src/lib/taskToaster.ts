import { toast } from 'vue-sonner'
import { taskApi } from '@/api/task'
import type { TaskInfo, TaskStatus } from '@/api/types'

const POLL_MS = 15_000
/** 轮询窗口：最近 50 条足以覆盖进行中的任务 */
const PAGE_SIZE = 50
/** 视为「进行中」的状态：迁移到 success / error 时触发通知 */
const ACTIVE_STATUSES: TaskStatus[] = ['waiting', 'downloading', 'loading']
/** 状态表上限，防止长期运行无限增长（Map 按插入序删最旧的） */
const MAX_TRACKED = 500

let started = false
const statusMap = new Map<string, TaskStatus>()

function taskLabel(t: TaskInfo): string {
  const name = t.downloadMusicname || t.downloadFile || String(t.id)
  return t.downloadArtistname ? `${name} - ${t.downloadArtistname}` : name
}

function errDesc(t: TaskInfo): string {
  const msg = (t.downloadMsg ?? '').trim()
  const short = msg.length > 60 ? `${msg.slice(0, 60)}…` : msg
  return short ? `${taskLabel(t)}：${short}` : taskLabel(t)
}

/** 多首任务描述：每行一首（最多 3 行）+ 尾注，配合右对齐与 pre-line 换行展示 */
function listDesc(list: TaskInfo[]): string {
  const lines = list.slice(0, 3).map(taskLabel)
  if (list.length > 3) lines.push(`等共 ${list.length} 首`)
  return lines.join('\n')
}

/** 逐行描述需要 pre-line 才能保留换行 */
const LIST_CLASS = { description: 'whitespace-pre-line' }

function check(list: TaskInfo[]) {
  const seen = new Set<string>()
  const done: TaskInfo[] = []
  const failed: TaskInfo[] = []
  for (const t of list) {
    const id = String(t.id)
    seen.add(id)
    const prev = statusMap.get(id)
    statusMap.set(id, t.downloadStatus)
    // 首次见到（prev 为空）只建档不通知，避免应用启动时对历史已完成任务刷屏
    if (!prev || prev === t.downloadStatus) continue
    if (ACTIVE_STATUSES.includes(prev) && t.downloadStatus === 'success') done.push(t)
    if (ACTIVE_STATUSES.includes(prev) && t.downloadStatus === 'error') failed.push(t)
  }
  if (statusMap.size > MAX_TRACKED) {
    let excess = statusMap.size - MAX_TRACKED
    for (const id of statusMap.keys()) {
      if (excess-- <= 0) break
      statusMap.delete(id)
    }
  }

  if (done.length === 1) toast.success('下载完成', { description: taskLabel(done[0]) })
  else if (done.length > 1)
    toast.success(`下载完成（${done.length} 首）`, {
      description: listDesc(done),
      classes: LIST_CLASS,
    })
  if (failed.length === 1) toast.error('下载失败', { description: errDesc(failed[0]) })
  else if (failed.length > 1)
    toast.error(`下载失败（${failed.length} 首）`, {
      description: listDesc(failed),
      classes: LIST_CLASS,
    })
}

/**
 * 启动全局下载完成 toast 通知（幂等）。
 * 由 App.vue 在登录成功后调用；仅通知应用运行期间发生的状态迁移。
 */
export function startTaskToasts() {
  if (started) return
  started = true
  const poll = async () => {
    try {
      const data = await taskApi.list({ pageSize: PAGE_SIZE, pageIndex: 1 })
      check(data.records ?? [])
    } catch {
      // 静默：连接异常已有全局横幅提示，此处不重复打扰
    }
  }
  poll()
  setInterval(() => {
    // 后台标签页暂停轮询，回前台后由下一次 tick 补齐状态迁移
    if (document.hidden) return
    poll()
  }, POLL_MS)
}
