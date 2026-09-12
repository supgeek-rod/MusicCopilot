<script setup lang="ts">
import { HistoryIcon, PlayIcon, SearchIcon, TrashIcon, XIcon } from '@lucide/vue'
import { onClickOutside, watchDebounced } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { musicApi } from '@/api/music'
import type { SongRecord } from '@/api/types'
import LyricDialog from '@/components/LyricDialog.vue'
import SongList from '@/components/SongList.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  clearSearchHistory,
  loadSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
} from '@/lib/searchHistory'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'
import { useRoute, useRouter } from 'vue-router'

const app = useAppStore()
const player = usePlayerStore()
const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 30

const plug = ref('kw')
const keyword = ref('')
const submitted = ref<{ kw: string } | null>(null)
const results = ref<SongRecord[]>([])
const total = ref(0)
const pageIndex = ref(1)
const loading = ref(false)

const tips = ref<string[]>([])
const tipsOpen = ref(false)
// 联想词键盘选中项（-1 = 未选中，↑↓ 移动，Enter 确认）
const tipsActive = ref(-1)
const searchBoxRef = ref<HTMLElement | null>(null)

// 搜索历史（localStorage 持久化，最新在前）
const history = ref<string[]>(loadSearchHistory())

const lyricOpen = ref(false)
const lyricSong = ref<SongRecord | null>(null)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// 首页（未搜索）状态：搜索框居中放大展示，历史记录平铺在下方
const isHero = computed(() => !submitted.value && !loading.value)

// 卸载后丢弃迟到响应，避免与路由切换产生更新竞态
let disposed = false
let searchSeq = 0
onBeforeUnmount(() => {
  disposed = true
})

// 联想面板：聚焦打开，失焦/Esc/搜索完成关闭；联想项用 mousedown.prevent 保持输入框焦点
function onInputFocus() {
  tipsOpen.value = true
}
function onInputBlur() {
  tipsOpen.value = false
  tipsActive.value = -1
}

// 音源不做界面选择：自动采用后端返回的第一个启用插件（无列表时保持默认 kw）
watch(
  () => app.plugOptions,
  (options) => {
    if (options.length && !options.some((o) => o.value === plug.value)) {
      plug.value = options[0]!.value
    }
  },
  { immediate: true },
)

// 搜索联想（防抖）
watchDebounced(
  keyword,
  async (kw) => {
    const q = kw.trim()
    if (!q) {
      tips.value = []
      tipsActive.value = -1
      return
    }
    try {
      const data = await musicApi.searchTips(plug.value, q)
      if (disposed) return
      tips.value = Array.isArray(data) ? data.slice(0, 8) : []
      tipsActive.value = -1
    } catch {
      tips.value = []
      tipsActive.value = -1
    }
  },
  { debounce: 300 },
)

/** ↑↓ 在联想词间移动选中项（到边停，↑ 在第一项时取消选中） */
function onTipsArrow(delta: number) {
  if (!tips.value.length) return
  tipsOpen.value = true
  const i = tipsActive.value + delta
  tipsActive.value = i < 0 || i >= tips.value.length ? (delta > 0 ? tips.value.length - 1 : -1) : i
}

/** Enter：有键盘选中的联想词则搜索它，否则按输入框内容搜索 */
function onSearchEnter() {
  const active = tipsActive.value
  if (tipsOpen.value && active >= 0 && tips.value[active]) {
    searchTerm(tips.value[active]!)
    return
  }
  doSearch(1)
}

onClickOutside(searchBoxRef, () => (tipsOpen.value = false))

async function doSearch(page = 1) {
  const kw = keyword.value.trim()
  if (!kw) return
  // 并发守卫：loading 期间切换音源/关键词重搜时，丢弃「后发先至」的过期响应
  const seq = ++searchSeq
  loading.value = true
  tipsOpen.value = false
  tips.value = []
  try {
    const data = await musicApi.searchSong(plug.value, kw, page, PAGE_SIZE)
    if (disposed || seq !== searchSeq) return
    results.value = data.records ?? []
    total.value = data.searchTotal ?? results.value.length
    pageIndex.value = page
    submitted.value = { kw }
    history.value = recordSearchHistory(kw)
    // 搜索条件同步进 URL（replace 不新增历史记录，可刷新恢复/分享）
    if (route.query.q !== kw) router.replace({ query: { q: kw } }).catch(() => {})
    if (!results.value.length) toast.info('没有找到相关歌曲')
  } catch (e) {
    if (disposed || seq !== searchSeq) return
    results.value = []
    total.value = 0
    toast.error('搜索失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    if (!disposed && seq === searchSeq) loading.value = false
    tipsOpen.value = false
  }
}

/** 点击联想词 / 历史词条：回填并以当前音源搜索 */
function searchTerm(term: string) {
  keyword.value = term
  tipsOpen.value = false
  tips.value = []
  tipsActive.value = -1
  doSearch(1)
}

function dropHistory(kw: string) {
  history.value = removeSearchHistory(kw)
}

function clearHistory() {
  history.value = clearSearchHistory()
}

function goPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  doSearch(page)
}

/** 立即播放本页搜索结果（替换播放队列，从第一首开始） */
function playAll() {
  if (!results.value.length) return
  player.playAll(results.value, 0).catch((e) =>
    toast.error('获取试听链接失败', { description: e instanceof Error ? e.message : String(e) }),
  )
}

/** 回到首页引导视图：清空全部搜索状态（点 LOGO 等入口跳到无 q 的 /search 时调用） */
function resetToHome() {
  searchSeq++ // 作废在途搜索响应，防止迟到响应把页面又拉回结果态
  keyword.value = ''
  submitted.value = null
  results.value = []
  total.value = 0
  pageIndex.value = 1
  loading.value = false
  tips.value = []
  tipsOpen.value = false
  tipsActive.value = -1
}

// 顶部导航栏快捷搜索 / 链接直达：读取并监听 ?q=
// （跳过与当前已提交关键词相同的值，避免 doSearch 内 router.replace 触发循环）
function searchFromRoute() {
  const q = route.query.q
  if (typeof q === 'string' && q && q !== submitted.value?.kw) {
    keyword.value = q
    doSearch(1)
  } else if (!q && submitted.value) {
    // q 被移除（如点击 LOGO）：离开结果态回到首页
    resetToHome()
  }
}
searchFromRoute()
watch(() => route.query.q, searchFromRoute)

function onLyrics(song: SongRecord) {
  lyricSong.value = song
  lyricOpen.value = true
}
// 结果页视图高度 = 视口 - header(3.5rem) - main 上 padding(1.5rem) - 底部留白
// （播放条可见时 pb-24=6rem，否则 pb-6=1.5rem）。列表容器内部滚动，窗口不出滚动条；
// min-h 兜底矮窗口（此时允许窗口滚动，保证可用性）
const resultsViewClass = computed(() =>
  player.song ? 'h-[calc(100vh-11rem)]' : 'h-[calc(100vh-6.5rem)]',
)
</script>

<template>
  <div :class="isHero ? 'flex min-h-[70vh] flex-col items-center justify-center' : ['flex min-h-[420px] flex-col overflow-hidden', resultsViewClass]">
    <!-- 首页状态：标题引导在搜索框上方（不放图标） -->
    <template v-if="isHero">
      <h1 class="text-center text-xl font-semibold">搜索你想听的音乐</h1>
      <p class="mt-1 text-center text-sm text-muted-foreground">支持在线试听、查看歌词，可下载到服务器或本机</p>
    </template>

    <!-- 搜索区：首页不放独立搜索按钮（放大镜即搜索键，布局更居中对称）；
         结果页保留外置按钮（行内空间紧凑，按钮语义更明确） -->
    <form
      class="flex w-full gap-2"
      :class="isHero ? 'mt-6 max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center' : ''"
      @submit.prevent="doSearch(1)"
    >
      <!-- 首页大搜索区与搜索结果页均不提供音源切换，音源由后端启用插件自动决定 -->
      <div ref="searchBoxRef" class="relative flex-1">
        <Input
          v-model="keyword"
          data-search-input
          placeholder="搜索歌曲 / 歌手 / 专辑，回车搜索"
          title="按 / 聚焦搜索"
          :class="isHero ? 'h-12 pr-12 text-base' : 'h-9 pr-9'"
          @focus="onInputFocus"
          @blur="onInputBlur"
          @keydown.down.prevent="onTipsArrow(1)"
          @keydown.up.prevent="onTipsArrow(-1)"
          @keydown.enter.prevent="onSearchEnter"
          @keydown.esc="tipsOpen = false"
        />
        <!-- 首页：输入框内右侧放大镜即搜索按钮；结果页仅作装饰图标 -->
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          :class="isHero ? 'absolute right-1.5 top-1/2 size-9 -translate-y-1/2 rounded-full' : 'pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 p-0 border-0 bg-transparent'"
          title="搜索"
        >
          <SearchIcon :class="isHero ? 'size-5' : 'size-4'" class="text-muted-foreground" />
        </Button>
        <div
          v-if="tipsOpen && tips.length"
          class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          <button
            v-for="(t, i) in tips"
            :key="t"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            :class="i === tipsActive ? 'bg-muted' : ''"
            @mousedown.prevent
            @mouseenter="tipsActive = i"
            @click="searchTerm(t)"
          >
            <SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ t }}</span>
          </button>
        </div>
        <!-- 搜索历史：聚焦且未输入关键词时展示（首页状态改为下方平铺展示） -->
        <div
          v-else-if="tipsOpen && !keyword.trim() && history.length && !isHero"
          class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          <div
            v-for="h in history"
            :key="h"
            class="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2"
              title="点击重新搜索"
              @mousedown.prevent
              @click="searchTerm(h)"
            >
              <HistoryIcon class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate">{{ h }}</span>
            </button>
            <button
              type="button"
              class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              title="删除该条"
              @mousedown.prevent
              @click.stop="dropHistory(h)"
            >
              <XIcon class="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            class="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            @mousedown.prevent
            @click="clearHistory"
          >
            <TrashIcon class="size-3.5 shrink-0" />
            清空搜索历史
          </button>
        </div>
      </div>

      <Button
        v-if="!isHero"
        type="submit"
        :disabled="loading || !keyword.trim()"
      >
        <SearchIcon class="size-4" />
        搜索
      </Button>
    </form>

    <!-- 首页状态：搜索历史（左对齐小字，弱化展示，点击可重新搜索） -->
    <div v-if="isHero" class="mt-10 flex w-full max-w-2xl flex-col items-start">
      <div v-if="history.length" class="w-full">
        <div class="mb-1.5 flex items-center justify-between px-1">
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HistoryIcon class="size-3.5" />
            搜索历史
          </span>
          <button
            type="button"
            class="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-foreground"
            @click="clearHistory"
          >
            清空
          </button>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 px-1">
          <div
            v-for="h in history"
            :key="h"
            class="group flex items-center gap-0.5 text-xs text-muted-foreground"
          >
            <button
              type="button"
              class="hover:text-foreground"
              :title="`搜索「${h}」`"
              @click="searchTerm(h)"
            >
              {{ h }}
            </button>
            <button
              type="button"
              class="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              title="删除该条"
              @click.stop="dropHistory(h)"
            >
              <XIcon class="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 结果区 -->
    <template v-else>
      <div class="mb-2 mt-6 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          找到约 <span class="font-medium text-foreground">{{ total }}</span> 首
        </span>
        <div class="flex items-center gap-3">
          <span v-if="keyword.trim() !== submitted?.kw" class="truncate text-xs">当前输入未搜索，回车更新结果</span>
          <Button
            size="sm"
            variant="secondary"
            :disabled="!results.length"
            title="立即播放本页全部歌曲"
            @click="playAll"
          >
            <PlayIcon class="size-4" />
            立即播放
          </Button>
        </div>
      </div>

      <!-- 列表容器：占据剩余高度内部滚动（min-h-0 是 flex 子项可收缩滚动的关键） -->
      <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border py-1">
        <SongList :songs="results" :loading="loading" @lyrics="onLyrics" />
        <div v-if="!loading && !results.length" class="py-16 text-center text-sm text-muted-foreground">
          没有找到相关歌曲
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="total > 0" class="mt-4 flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" :disabled="pageIndex <= 1 || loading" @click="goPage(pageIndex - 1)">
          上一页
        </Button>
        <span class="text-sm text-muted-foreground">
          第 {{ pageIndex }} / {{ totalPages }} 页
        </span>
        <Button variant="outline" size="sm" :disabled="pageIndex >= totalPages || loading" @click="goPage(pageIndex + 1)">
          下一页
        </Button>
      </div>
    </template>

    <LyricDialog v-model:open="lyricOpen" :song="lyricSong" />
  </div>
</template>
