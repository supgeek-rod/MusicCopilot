<script setup lang="ts">
import { ListMusicIcon, RefreshCwIcon, RotateCcwIcon, Trash2Icon } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { taskApi } from '@/api/task'
import type { TaskInfo, TaskStatus } from '@/api/types'
import QualityBadge from '@/components/QualityBadge.vue'
import { formatSize, taskSizeBytes } from '@/lib/format'
import { usePlayerStore } from '@/stores/player'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 20
const POLL_MS = 5000

const tasks = ref<TaskInfo[]>([])
const total = ref(0)
const pages = ref(1)
const pageIndex = ref(1)
const status = ref<'all' | TaskStatus>('all')
const loading = ref(false)
const acting = ref(false)

const statusOptions: { value: 'all' | TaskStatus; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'waiting', label: '等待中' },
  { value: 'downloading', label: '下载中' },
  { value: 'loading', label: '解析中' },
  { value: 'success', label: '成功' },
  { value: 'error', label: '失败' },
]

const confirm = reactive<{
  open: boolean
  title: string
  desc: string
  action: (() => Promise<void>) | null
}>({ open: false, title: '', desc: '', action: null })

function statusView(s: TaskStatus): { label: string; class: string } {
  switch (s) {
    case 'waiting':
      return { label: '等待中', class: 'bg-secondary text-secondary-foreground' }
    case 'downloading':
      return { label: '下载中', class: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' }
    case 'loading':
      return { label: '解析中', class: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse' }
    case 'success':
      return { label: '成功', class: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    case 'error':
      return { label: '失败', class: 'bg-destructive/10 text-destructive' }
    default:
      return { label: String(s), class: 'bg-muted text-muted-foreground' }
  }
}

// 大小为按入队音质的本地估算值（downloadMusicInfo），不产生额外请求
function sizeText(t: TaskInfo): string {
  return formatSize(taskSizeBytes(t.downloadBrType, t.downloadMusicInfo)) || '—'
}

// 组件卸载后丢弃迟到的响应，避免对已卸载实例的状态写入与路由切换竞态
let disposed = false

async function fetchTasks(silent = false) {
  if (disposed) return
  if (!silent) loading.value = true
  try {
    const data = await taskApi.list({
      pageSize: PAGE_SIZE,
      pageIndex: pageIndex.value,
      downloadStatus: status.value === 'all' ? undefined : status.value,
    })
    if (disposed) return
    tasks.value = data.records ?? []
    total.value = data.total ?? tasks.value.length
    pages.value = Math.max(1, data.pages ?? Math.ceil(total.value / PAGE_SIZE))
    if (pageIndex.value > pages.value) pageIndex.value = pages.value
  } catch (e) {
    if (!silent && !disposed)
      toast.error('获取任务列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    if (!disposed) loading.value = false
  }
}

watch(status, () => {
  pageIndex.value = 1
  fetchTasks()
})
watch(pageIndex, () => fetchTasks())

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  disposed = false
  fetchTasks()
  timer = setInterval(() => {
    // 页面在后台标签页时暂停轮询，回前台由下一次 tick 或手动刷新补齐
    if (document.hidden) return
    fetchTasks(true)
  }, POLL_MS)
})
onBeforeUnmount(() => {
  disposed = true
  if (timer) clearInterval(timer)
})

function askConfirm(title: string, desc: string, action: () => Promise<void>) {
  confirm.title = title
  confirm.desc = desc
  confirm.action = action
  confirm.open = true
}

async function runConfirm() {
  const action = confirm.action
  if (!action) return
  acting.value = true
  try {
    await action()
  } finally {
    acting.value = false
    confirm.open = false
  }
}

/** 行内操作进行中的任务 id：防止连点重复提交（确认框流程另有 acting 兜底） */
const busyTaskId = ref<string | number | null>(null)

async function withToast(desc: string, fn: () => Promise<unknown>, taskId?: string | number) {
  if (taskId !== undefined && busyTaskId.value !== null) return
  if (taskId !== undefined) busyTaskId.value = taskId
  try {
    await fn()
    toast.success(desc)
  } catch (e) {
    toast.error('操作失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    if (taskId !== undefined) busyTaskId.value = null
    fetchTasks(true)
  }
}

function retryTask(t: TaskInfo) {
  withToast('已重新提交下载', () => taskApi.retryError(t.id), t.id)
}

function refreshTask(t: TaskInfo) {
  withToast('任务已重新入队', () => taskApi.refreshTask(t.id), t.id)
}

function delTask(t: TaskInfo) {
  askConfirm('删除下载任务', `确定删除「${t.downloadMusicname ?? t.id}」的任务记录吗？`, async () => {
    await withToast('任务已删除', () => taskApi.del(t.id))
  })
}

function retryAll() {
  askConfirm('重试全部失败任务', '将所有失败的任务重新提交下载。', async () => {
    await withToast('已提交全部失败任务', () => taskApi.retryAllError())
  })
}

function bulkDel(kind: 'error' | 'success' | 'waiting') {
  const map = {
    error: { label: '失败', fn: taskApi.delErrorTasks },
    success: { label: '成功', fn: taskApi.delSuccessTasks },
    waiting: { label: '等待中', fn: taskApi.delWaitingTasks },
  } as const
  askConfirm(
    `删除${map[kind].label}任务`,
    `将清除服务器上所有状态为「${map[kind].label}」的任务记录（当前筛选下共 ${total.value} 条，不受筛选影响，实际影响范围可能更大）。`,
    async () => {
      await withToast('已删除', map[kind].fn)
    },
  )
}

// ── 视口锁定布局（参考搜索页）：页面高度=视口，任务表内部滚动 ──
const player = usePlayerStore()

// 高度 = 视口 - header(3.5rem) - main 上边距(1.5rem) - 底部留白（播放条 6rem / 1.5rem）
const viewClass = computed(() =>
  player.song ? 'h-[calc(100vh-11rem)]' : 'h-[calc(100vh-6.5rem)]',
)

// 滚动条自动隐藏：滚动中或悬停时可见（样式见 style.css 的 .scroll-auto-hide）
const listEl = ref<HTMLElement | null>(null)
const listScrolling = ref(false)
let scrollTimer: ReturnType<typeof setTimeout> | undefined
function onListScroll() {
  listScrolling.value = true
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => (listScrolling.value = false), 800)
}
onBeforeUnmount(() => clearTimeout(scrollTimer))
</script>

<template>
  <div :class="['flex min-h-[420px] flex-col overflow-hidden', viewClass]">
    <!-- 工具栏 -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <h2 class="mr-auto text-lg font-semibold">下载任务</h2>

      <Select v-model="status">
        <SelectTrigger class="w-[110px]" title="按状态筛选">
          <SelectValue placeholder="全部状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" :disabled="loading" @click="fetchTasks()">
        <RefreshCwIcon class="size-3.5" :class="{ 'animate-spin': loading }" />
        刷新
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            <ListMusicIcon class="size-3.5" />
            批量操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuItem @select="retryAll">
            <RotateCcwIcon class="size-4" />重试全部失败任务
          </DropdownMenuItem>
          <DropdownMenuItem @select="bulkDel('error')">
            <Trash2Icon class="size-4" />删除失败任务
          </DropdownMenuItem>
          <DropdownMenuItem @select="bulkDel('success')">
            <Trash2Icon class="size-4" />删除成功任务
          </DropdownMenuItem>
          <DropdownMenuItem @select="bulkDel('waiting')">
            <Trash2Icon class="size-4" />删除等待中任务
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- 任务表：占据剩余高度内部滚动，滚动条自动隐藏 -->
    <div
      ref="listEl"
      class="scroll-auto-hide min-h-0 flex-1 overflow-y-auto rounded-lg border"
      :class="listScrolling ? 'scrolling' : ''"
      @scroll="onListScroll"
    >
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/50 hover:bg-muted/50">
            <TableHead>歌曲</TableHead>
            <TableHead class="w-[110px]">音质</TableHead>
            <TableHead class="hidden w-[80px] md:table-cell">大小</TableHead>
            <TableHead class="w-[90px]">状态</TableHead>
            <TableHead class="hidden lg:table-cell lg:w-[160px]">更新时间</TableHead>
            <TableHead class="w-[110px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell :colspan="6" class="h-10 animate-pulse bg-muted/40" />
            </TableRow>
          </template>
          <TableRow v-else-if="!tasks.length">
            <TableCell colspan="6" class="h-28 text-center text-sm text-muted-foreground">
              暂无下载任务，去搜索页添加吧
            </TableCell>
          </TableRow>
          <TableRow v-else v-for="t in tasks" :key="String(t.id)">
            <TableCell>
              <div class="max-w-[280px] truncate text-sm font-medium" :title="t.downloadFile ?? ''">
                {{ t.downloadMusicname || t.downloadFile || t.id }}
              </div>
              <div class="max-w-[280px] truncate text-xs text-muted-foreground">
                {{ [t.downloadArtistname, t.downloadAlbumname].filter(Boolean).join(' · ') || '—' }}
              </div>
            </TableCell>
            <TableCell>
              <QualityBadge v-if="t.downloadBrType" :br-type="t.downloadBrType" />
              <span v-else class="text-xs text-muted-foreground">—</span>
            </TableCell>
            <TableCell class="hidden text-xs text-muted-foreground md:table-cell">
              {{ sizeText(t) }}
            </TableCell>
            <TableCell>
              <span
                class="inline-flex h-5 items-center rounded-2xl px-2 text-xs font-medium"
                :class="statusView(t.downloadStatus).class"
              >
                {{ statusView(t.downloadStatus).label }}
              </span>
            </TableCell>
            <TableCell class="hidden text-xs text-muted-foreground lg:table-cell">
              {{ t.downloadUpdateTime || '—' }}
            </TableCell>
            <TableCell class="text-right">
              <div class="flex justify-end gap-0.5">
                <Button
                  v-if="t.downloadStatus === 'error'"
                  variant="ghost"
                  size="icon-sm"
                  title="重试"
                  :disabled="acting || busyTaskId === t.id"
                  @click="retryTask(t)"
                >
                  <RotateCcwIcon class="size-4" />
                </Button>
                <Button
                  v-else-if="t.downloadStatus === 'waiting' || t.downloadStatus === 'loading'"
                  variant="ghost"
                  size="icon-sm"
                  title="重新入队"
                  :disabled="acting || busyTaskId === t.id"
                  @click="refreshTask(t)"
                >
                  <RefreshCwIcon class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="删除"
                  :disabled="acting"
                  class="text-destructive hover:text-destructive"
                  @click="delTask(t)"
                >
                  <Trash2Icon class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- 分页 -->
    <div class="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>共 {{ total }} 个任务</span>
      <div class="flex items-center gap-3">
        <Button variant="outline" size="sm" :disabled="pageIndex <= 1 || loading" @click="pageIndex--">
          上一页
        </Button>
        <span>第 {{ pageIndex }} / {{ pages }} 页</span>
        <Button variant="outline" size="sm" :disabled="pageIndex >= pages || loading" @click="pageIndex++">
          下一页
        </Button>
      </div>
    </div>

    <!-- 确认框 -->
    <AlertDialog v-model:open="confirm.open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ confirm.title }}</AlertDialogTitle>
          <AlertDialogDescription>{{ confirm.desc }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="runConfirm">确定</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
