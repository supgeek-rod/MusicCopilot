<script setup lang="ts">
import { HeartPulseIcon, RefreshCwIcon, ScanSearchIcon, Settings2Icon } from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { scraperApi, scraperRuntime } from '@/api/companion'
import type {
  MatchResultItem,
  ScraperCandidate,
  ScraperConfig,
  ScraperJob,
  ScraperStatus,
  ScraperTrack,
  TagChange,
  TrackFilter,
  WriteItemResult,
} from '@/api/companion'
import { useAppStore } from '@/stores/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const app = useAppStore()

const PAGE_SIZE = 50
const POLL_MS = 1500

const enabled = computed(() => app.config?.scraper?.enabled === true)

const status = ref<ScraperStatus | null>(null)
const loadingStatus = ref(false)

const filter = ref<TrackFilter>('all')
const search = ref('')
const searchInput = ref('')
const page = ref(1)
const tracks = ref<ScraperTrack[]>([])
const total = ref(0)
const loadingTracks = ref(false)

const selected = ref<Set<number>>(new Set())
const acting = ref(false)

const activeJob = ref<ScraperJob | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
/** 匹配任务完成后的候选（trackId → 结果），驱动候选选择弹窗 */
const matchResults = ref<Map<number, MatchResultItem>>(new Map())
const matchSelections = reactive<Record<number, number>>({})

const disposed = ref(false)
let requestSeq = 0

const filterOptions: { value: TrackFilter; label: string }[] = [
  { value: 'all', label: '全部曲目' },
  { value: 'missing_cover', label: '缺封面' },
  { value: 'missing_lyrics', label: '缺歌词' },
  { value: 'missing_album', label: '缺专辑' },
  { value: 'missing_artist', label: '缺歌手' },
  { value: 'messy_name', label: '文件名混乱' },
  { value: 'suspect_dup', label: '疑似重复' },
]

const fieldLabels: Record<TagChange['field'], string> = {
  title: '标题',
  artist: '歌手',
  album: '专辑',
  albumArtist: '专辑歌手',
  cover: '封面',
  lyrics: '歌词',
  rename: '重命名',
}

// ── 配置弹窗 ──
const configOpen = ref(false)
const configForm = ref<ScraperConfig | null>(null)
const configSaving = ref(false)

// ── 写入预览（dry-run）→ 确认 ──
const previewOpen = ref(false)
const previewItems = ref<WriteItemResult[]>([])
const previewLoading = ref(false)

const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const selectedIds = computed(() => Array.from(selected.value))

onMounted(async () => {
  scraperRuntime.token = app.config?.scraper?.token ?? ''
  if (!enabled.value) return
  await Promise.all([refreshStatus(), refreshTracks()])
})

onBeforeUnmount(() => {
  disposed.value = true
  stopPoll()
})

watchDebounced(
  searchInput,
  (v) => {
    search.value = v
    page.value = 1
    void refreshTracks()
  },
  { debounce: 300 },
)

function guard<T>(e: unknown, fallback: T): T {
  if (disposed.value) return fallback
  const msg = e instanceof Error ? e.message : String(e)
  toast.error(msg)
  return fallback
}

async function refreshStatus(): Promise<void> {
  loadingStatus.value = true
  try {
    status.value = await scraperApi.getStatus()
  } catch (e) {
    guard(e, null)
  } finally {
    loadingStatus.value = false
  }
}

async function refreshTracks(): Promise<void> {
  const seq = ++requestSeq
  loadingTracks.value = true
  try {
    const res = await scraperApi.listTracks({ filter: filter.value, search: search.value, page: page.value, pageSize: PAGE_SIZE })
    if (disposed.value || seq !== requestSeq) return
    tracks.value = res.items
    total.value = res.total
    const ids = new Set(res.items.map((t) => t.id))
    selected.value = new Set(Array.from(selected.value).filter((id) => ids.has(id)))
  } catch (e) {
    guard(e, null)
  } finally {
    if (!disposed.value && seq === requestSeq) loadingTracks.value = false
  }
}

function setFilter(f: TrackFilter): void {
  filter.value = f
  page.value = 1
  void refreshTracks()
}

function toggleSelect(id: number): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const allSelected = computed(
  () => tracks.value.length > 0 && tracks.value.every((t) => selected.value.has(t.id)),
)

function toggleSelectAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(tracks.value.map((t) => t.id))
}

// ── 任务轮询 ──

function startPoll(jobId: string): void {
  stopPoll()
  pollTimer = setInterval(async () => {
    try {
      const job = await scraperApi.getJob(jobId)
      if (disposed.value) return
      activeJob.value = job
      if (job.status === 'done' || job.status === 'error') {
        stopPoll()
        void onJobFinished(job)
      }
    } catch {
      // 轮询失败静默，下一轮重试
    }
  }, POLL_MS)
}

function stopPoll(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function onJobFinished(job: ScraperJob): Promise<void> {
  if (job.kind === 'scan') {
    const r = job.result
    toast.success(
      `扫描完成：新增 ${r?.added ?? 0}，更新 ${r?.updated ?? 0}，跳过 ${r?.skipped ?? 0}，移除 ${r?.removed ?? 0}` +
        (job.errorCount > 0 ? `，失败 ${job.errorCount}` : ''),
    )
    await Promise.all([refreshStatus(), refreshTracks()])
  } else if (job.kind === 'match') {
    const results = job.result?.results ?? []
    matchResults.value = new Map(results.map((r) => [r.trackId, r]))
    for (const r of results) {
      const best = r.candidates.findIndex((c) => c.score >= (status.value?.config.minScore ?? 0.8))
      matchSelections[r.trackId] = best >= 0 ? best : 0
    }
    const empty = results.filter((r) => r.candidates.length === 0).length
    toast.success(`匹配完成（${results.length - empty} 首有候选${empty > 0 ? `，${empty} 首无结果` : ''}）`)
    openCandidates()
  } else if (job.kind === 'write') {
    const items = job.result?.items ?? []
    const written = items.filter((i) => i.status === 'written').length
    const skipped = items.filter((i) => i.status === 'skipped').length
    const failed = items.filter((i) => i.status === 'error').length
    if (job.result?.dryRun) {
      previewItems.value = items
      previewOpen.value = true
    } else {
      toast.success(`写入完成：成功 ${written}，跳过 ${skipped}${failed > 0 ? `，失败 ${failed}` : ''}`)
      await Promise.all([refreshStatus(), refreshTracks()])
    }
  }
  activeJob.value = null
}

async function startScan(): Promise<void> {
  if (acting.value) return
  acting.value = true
  try {
    const { jobId } = await scraperApi.startScan()
    activeJob.value = await scraperApi.getJob(jobId)
    startPoll(jobId)
  } catch (e) {
    guard(e, null)
  } finally {
    acting.value = false
  }
}

async function matchSelected(): Promise<void> {
  if (acting.value || selectedIds.value.length === 0) return
  acting.value = true
  try {
    const { jobId } = await scraperApi.match(selectedIds.value)
    activeJob.value = await scraperApi.getJob(jobId)
    startPoll(jobId)
  } catch (e) {
    guard(e, null)
  } finally {
    acting.value = false
  }
}

/** 匹配完成后的候选选择弹窗（从最近一次匹配任务的持久化结果还原） */
const candidatesOpen = ref(false)

function openCandidates(): void {
  if (matchResults.value.size === 0) {
    toast.info('没有可预览的匹配结果')
    return
  }
  candidatesOpen.value = true
}

function candidatesOf(trackId: number): ScraperCandidate[] {
  return matchResults.value.get(trackId)?.candidates ?? []
}

async function dryRunSelected(): Promise<void> {
  const trackIds = Object.keys(matchSelections)
    .map(Number)
    .filter((id) => matchResults.value.has(id))
  if (trackIds.length === 0) {
    toast.info('请先匹配，再预览写入')
    return
  }
  previewLoading.value = true
  try {
    const selections: Record<string, number> = {}
    for (const id of trackIds) selections[String(id)] = matchSelections[id] ?? 0
    const { jobId } = await scraperApi.write(trackIds, true, selections)
    const job = await scraperApi.getJob(jobId)
    // dry-run 通常秒级完成；未完成则交给轮询，完成后 onJobFinished 打开预览
    if (job.status === 'done' || job.status === 'error') {
      activeJob.value = null
      previewItems.value = job.result?.items ?? []
      previewOpen.value = true
    } else {
      activeJob.value = job
      startPoll(jobId)
    }
  } catch (e) {
    guard(e, null)
  } finally {
    previewLoading.value = false
  }
}

async function confirmWrite(): Promise<void> {
  const trackIds = previewItems.value
    .filter((i) => i.status === 'would-write')
    .map((i) => i.trackId)
  previewOpen.value = false
  if (trackIds.length === 0) return
  acting.value = true
  try {
    const selections: Record<string, number> = {}
    for (const id of trackIds) selections[String(id)] = matchSelections[id] ?? 0
    const { jobId } = await scraperApi.write(trackIds, false, selections)
    activeJob.value = await scraperApi.getJob(jobId)
    startPoll(jobId)
  } catch (e) {
    guard(e, null)
  } finally {
    acting.value = false
  }
}

async function ignoreSelected(): Promise<void> {
  if (selectedIds.value.length === 0) return
  acting.value = true
  try {
    for (const id of selectedIds.value) await scraperApi.ignoreAdd(id)
    toast.success(`已忽略 ${selectedIds.value.length} 首（不再出现在体检清单）`)
    selected.value = new Set()
    await Promise.all([refreshStatus(), refreshTracks()])
  } catch (e) {
    guard(e, null)
  } finally {
    acting.value = false
  }
}

// ── 配置 ──

function openConfig(): void {
  configForm.value = { ...(status.value?.config ?? defaultConfig()) }
  configOpen.value = true
}

function defaultConfig(): ScraperConfig {
  return {
    writePolicy: 'fill-missing',
    embedCover: true,
    embedLyrics: true,
    renameEnabled: false,
    renameTemplate: '{artist} - {title}',
    backup: true,
    minScore: 0.8,
    matchConcurrency: 3,
  }
}

async function saveConfig(): Promise<void> {
  if (!configForm.value || configSaving.value) return
  configSaving.value = true
  try {
    const saved = await scraperApi.putConfig(configForm.value)
    if (status.value) status.value = { ...status.value, config: saved }
    toast.success('刮削配置已保存')
    configOpen.value = false
  } catch (e) {
    guard(e, null)
  } finally {
    configSaving.value = false
  }
}

// ── 展示辅助 ──

function fmtDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function tagsText(t: ScraperTrack): string {
  return [t.title ?? '（无标题）', t.artist ?? '（无歌手）', t.album ?? '（无专辑）'].join(' · ')
}

function issuesOf(t: ScraperTrack): { label: string; class: string }[] {
  const out: { label: string; class: string }[] = []
  if (!t.hasCover) out.push({ label: '缺封面', class: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' })
  if (!t.hasLyrics) out.push({ label: '缺歌词', class: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' })
  if (!t.album) out.push({ label: '缺专辑', class: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' })
  if (!t.artist) out.push({ label: '缺歌手', class: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' })
  if (t.messyName) out.push({ label: '文件名混乱', class: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' })
  return out
}

function levelClass(level: ScraperCandidate['level']): string {
  return level === 'high'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : level === 'medium'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : 'bg-muted text-muted-foreground'
}

function levelLabel(level: ScraperCandidate['level']): string {
  return level === 'high' ? '高' : level === 'medium' ? '中' : '低'
}

function writeStatusView(s: WriteItemResult['status']): { label: string; class: string } {
  switch (s) {
    case 'written':
      return { label: '已写入', class: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    case 'would-write':
      return { label: '待写入', class: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' }
    case 'skipped':
      return { label: '跳过', class: 'bg-muted text-muted-foreground' }
    case 'error':
      return { label: '失败', class: 'bg-destructive/10 text-destructive' }
  }
}

const jobKindLabel: Record<ScraperJob['kind'], string> = {
  scan: '扫描音乐库',
  match: '在线匹配',
  write: '写入标签',
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-4 p-4">
    <!-- 未启用提示 -->
    <Card v-if="!enabled">
      <CardContent class="flex flex-col items-center gap-2 p-10 text-center">
        <HeartPulseIcon class="size-10 text-muted-foreground" />
        <p class="font-medium">刮削工具未接入</p>
        <p class="max-w-md text-sm text-muted-foreground">
          需要部署 scraper 刮削工具容器并在 .env 配置 MC_SCRAPER_BASE_URL（详见 docs/META_SCRAPER_PLAN.md）。
        </p>
      </CardContent>
    </Card>

    <template v-else>
      <!-- 头部：标题 + 操作 -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold">音乐库体检</h1>
          <p v-if="status" class="text-xs text-muted-foreground">
            {{ status.musicDir }} · 曲库 {{ status.stats.tracks }} 首 · 工具 v{{ status.version }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="openConfig">
            <Settings2Icon class="size-4" /> 刮削配置
          </Button>
          <Button size="sm" :disabled="acting || activeJob !== null" @click="startScan">
            <ScanSearchIcon class="size-4" /> 扫描音乐库
          </Button>
        </div>
      </div>

      <!-- 任务进度 -->
      <Card v-if="activeJob && (activeJob.status === 'running' || activeJob.status === 'queued')">
        <CardContent class="space-y-2 p-4">
          <div class="flex items-center justify-between text-sm">
            <span>{{ jobKindLabel[activeJob.kind] }}中…</span>
            <span class="text-muted-foreground">{{ activeJob.done }} / {{ activeJob.total }}</span>
          </div>
          <Progress :model-value="activeJob.total > 0 ? (activeJob.done / activeJob.total) * 100 : 0" />
          <p class="truncate text-xs text-muted-foreground">{{ activeJob.currentFile ?? '' }}</p>
        </CardContent>
      </Card>

      <!-- 体检总览 -->
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          class="rounded-lg border p-3 text-left transition-colors hover:bg-accent"
          :class="filter === opt.value ? 'border-primary bg-primary/5' : ''"
          @click="setFilter(opt.value)"
        >
          <p class="text-lg font-semibold">{{ status?.stats[opt.value === 'all' ? 'tracks' : opt.value] ?? '—' }}</p>
          <p class="text-xs text-muted-foreground">{{ opt.label }}</p>
        </button>
        <div class="rounded-lg border p-3">
          <p class="text-lg font-semibold">{{ status?.stats.ignored ?? '—' }}</p>
          <p class="text-xs text-muted-foreground">已忽略</p>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model="searchInput"
          placeholder="按文件名/标签搜索…"
          class="h-9 w-56"
        />
        <span class="text-sm text-muted-foreground">已选 {{ selected.size }} 首</span>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" :disabled="acting || selected.size === 0 || activeJob !== null" @click="matchSelected">
            匹配选中
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="previewLoading || selected.size === 0 || matchResults.size === 0"
            @click="openCandidates"
          >
            候选与写入…
          </Button>
          <Button variant="ghost" size="sm" :disabled="acting || selected.size === 0" @click="ignoreSelected">
            忽略选中
          </Button>
          <Button variant="ghost" size="icon" class="size-8" :disabled="loadingTracks" @click="refreshTracks">
            <RefreshCwIcon class="size-4" :class="loadingTracks ? 'animate-spin' : ''" />
          </Button>
        </div>
      </div>

      <!-- 曲目清单 -->
      <div class="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-10">
                <input
                  type="checkbox"
                  class="size-4 accent-violet-600"
                  :checked="allSelected"
                  @change="toggleSelectAll"
                />
              </TableHead>
              <TableHead>文件 / 标签</TableHead>
              <TableHead class="w-24">时长</TableHead>
              <TableHead class="w-56">问题</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="t in tracks" :key="t.id">
              <TableCell>
                <input
                  type="checkbox"
                  class="size-4 accent-violet-600"
                  :checked="selected.has(t.id)"
                  @change="toggleSelect(t.id)"
                />
              </TableCell>
              <TableCell>
                <p class="truncate font-medium">{{ t.fileName }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ tagsText(t) }}</p>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">{{ fmtDuration(t.durationSec) }}</TableCell>
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Badge
                    v-for="issue in issuesOf(t)"
                    :key="issue.label"
                    variant="secondary"
                    class="cursor-pointer"
                    :class="issue.class"
                    @click="setFilter(filter)"
                  >
                    {{ issue.label }}
                  </Badge>
                  <span v-if="issuesOf(t).length === 0" class="text-xs text-muted-foreground">无问题</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="!loadingTracks && tracks.length === 0">
              <TableCell colspan="4" class="py-10 text-center text-muted-foreground">
                没有符合条件的曲目（点击「扫描音乐库」建立索引）
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 分页 -->
      <div v-if="pages > 1" class="flex items-center justify-center gap-3 text-sm">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--; refreshTracks()">上一页</Button>
        <span class="text-muted-foreground">{{ page }} / {{ pages }}</span>
        <Button variant="outline" size="sm" :disabled="page >= pages" @click="page++; refreshTracks()">下一页</Button>
      </div>
    </template>

    <!-- 候选选择弹窗 -->
    <Dialog v-model:open="candidatesOpen">
      <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>匹配候选</DialogTitle>
          <DialogDescription>为每首曲目选择在线候选（默认置信度最高），随后预览写入。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div v-for="[trackId, result] in matchResults" :key="trackId" class="space-y-1">
            <p class="truncate text-sm font-medium">{{ result.path }}</p>
            <p v-if="result.error" class="text-xs text-destructive">{{ result.error }}</p>
            <p v-else-if="result.candidates.length === 0" class="text-xs text-muted-foreground">无候选</p>
            <div v-else class="space-y-1">
              <label
                v-for="(c, idx) in result.candidates.slice(0, 5)"
                :key="c.id"
                class="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent"
              >
                <input
                  type="radio"
                  class="accent-violet-600"
                  :name="`cand-${trackId}`"
                  :checked="(matchSelections[trackId] ?? 0) === idx"
                  @change="matchSelections[trackId] = idx"
                />
                <Badge variant="secondary" class="shrink-0" :class="levelClass(c.level)">
                  {{ levelLabel(c.level) }} {{ Math.round(c.score * 100) }}%
                </Badge>
                <span class="truncate">{{ c.name }} — {{ c.artistName.join(' / ') }} · {{ c.albumName ?? '（无专辑）' }}</span>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="candidatesOpen = false">取消</Button>
          <Button :disabled="previewLoading" @click="dryRunSelected">
            {{ previewLoading ? '生成预览…' : 'dry-run 预览写入' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 写入预览 / 结果确认 -->
    <Dialog v-model:open="previewOpen">
      <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>写入预览（dry-run）</DialogTitle>
          <DialogDescription>以下变更尚未写入文件；确认后才会执行。</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div v-for="item in previewItems" :key="item.trackId" class="space-y-1 rounded-md border p-3">
            <div class="flex items-center gap-2">
              <Badge variant="secondary" :class="writeStatusView(item.status).class">
                {{ writeStatusView(item.status).label }}
              </Badge>
              <span class="truncate text-sm font-medium">{{ item.path }}</span>
            </div>
            <p v-if="item.message" class="text-xs text-muted-foreground">{{ item.message }}</p>
            <ul v-if="item.applied && item.applied.length" class="space-y-0.5 text-xs">
              <li v-for="(c, i) in item.applied" :key="i" class="flex gap-2">
                <span class="w-16 shrink-0 text-muted-foreground">{{ fieldLabels[c.field] ?? c.field }}</span>
                <span class="truncate">
                  <template v-if="c.from">{{ c.from }} → </template><span class="font-medium">{{ c.to }}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="previewOpen = false">取消</Button>
          <Button
            v-if="previewItems.some((i) => i.status === 'would-write')"
            :disabled="acting"
            @click="confirmWrite"
          >
            确认写入 {{ previewItems.filter((i) => i.status === 'would-write').length }} 首
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 刮削配置 -->
    <Dialog v-model:open="configOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>刮削配置</DialogTitle>
          <DialogDescription>保存到刮削工具（对所有设备生效）。</DialogDescription>
        </DialogHeader>
        <div v-if="configForm" class="space-y-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium">写入策略</p>
              <p class="text-xs text-muted-foreground">仅补空缺字段，或用候选整组覆盖</p>
            </div>
            <Select v-model="configForm.writePolicy">
              <SelectTrigger class="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fill-missing">仅补空缺</SelectItem>
                <SelectItem value="overwrite">覆盖写入</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <label class="flex items-center justify-between gap-4">
            <span class="text-sm font-medium">内嵌封面</span>
            <input type="checkbox" v-model="configForm.embedCover" class="size-4 accent-violet-600" />
          </label>
          <label class="flex items-center justify-between gap-4">
            <span class="text-sm font-medium">内嵌歌词</span>
            <input type="checkbox" v-model="configForm.embedLyrics" class="size-4 accent-violet-600" />
          </label>
          <label class="flex items-center justify-between gap-4">
            <span class="text-sm font-medium">写入前备份到 .mc-backup/</span>
            <input type="checkbox" v-model="configForm.backup" class="size-4 accent-violet-600" />
          </label>
          <label class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium">按「歌手 - 标题」重命名</p>
              <p class="text-xs text-muted-foreground">冲突自动跳过，不回滚写入</p>
            </div>
            <input type="checkbox" v-model="configForm.renameEnabled" class="size-4 accent-violet-600" />
          </label>
          <div v-if="configForm.renameEnabled" class="space-y-1">
            <p class="text-sm font-medium">重命名模板</p>
            <Input v-model="configForm.renameTemplate" placeholder="{artist} - {title}" />
            <p class="text-xs text-muted-foreground">可用变量：{artist} {title} {album} {year} {trackNo}</p>
          </div>
          <Separator />
          <div class="space-y-1">
            <p class="text-sm font-medium">自动写入置信度下限：{{ Math.round(configForm.minScore * 100) }}%</p>
            <p class="text-xs text-muted-foreground">低于该值的候选仅展示，需人工选择；无歌手参照的查询最高 75%</p>
            <input
              v-model.number="configForm.minScore"
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              class="w-full accent-violet-600"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="configOpen = false">取消</Button>
          <Button :disabled="configSaving" @click="saveConfig">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
