<script setup lang="ts">
import {
  HeartPulseIcon,
  HistoryIcon,
  KeyboardIcon,
  LibraryIcon,
  ListMusicIcon,
  MoonIcon,
  Music2Icon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
  XIcon,
} from '@lucide/vue'
import { onClickOutside, useDark, useToggle, watchDebounced } from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { musicApi } from '@/api/music'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { clearSearchHistory, loadSearchHistory, removeSearchHistory } from '@/lib/searchHistory'
import { useAppStore } from '@/stores/app'
import { useFnosStore } from '@/stores/fnos'

// 快捷键速查弹窗由 App.vue 挂载，`?` 键或此处下拉均可唤出
const emit = defineEmits<{ showShortcuts: [] }>()

const app = useAppStore()
const fnos = useFnosStore()
const route = useRoute()
const router = useRouter()
const isDark = useDark()
const toggleDark = useToggle(isDark)

const statusTitle = computed(() => `${app.statusMsg}｜后端：${app.apiBase || '同源'}`)

// 左侧导航：下载任务 + 音乐库（音乐库仅在配置了 fnOS 接入时显示）+ 体检（scraper 工具接入时显示）；搜索走右侧快捷搜索框
const navs = computed(() => {
  const list = [{ path: '/downloads', label: '下载任务', icon: ListMusicIcon }]
  // 音乐库入口仅在配置了 fnOS 接入（MC_FNOS_BASE_URL）时显示
  if (fnos.enabled) list.splice(1, 0, { path: '/library', label: '音乐库', icon: LibraryIcon })
  // 音乐库体检入口仅在配置了刮削工具（MC_SCRAPER_BASE_URL）时显示
  if (app.config?.scraper?.enabled) {
    list.push({ path: '/library/health', label: '体检', icon: HeartPulseIcon })
  }
  return list
})

function isActive(path: string): boolean {
  if (path === '/library') {
    // 体检页（/library/health）有自己的导航项，不归入音乐库高亮
    return route.path === '/library' || route.path.startsWith('/library/collection')
  }
  return route.path === path
}

const keyword = ref('')
const tips = ref<string[]>([])
const tipsOpen = ref(false)
const history = ref<string[]>([])
const searchBoxRef = ref<HTMLElement | null>(null)

// 联想请求跟随搜索页默认音源（首个启用插件），插件列表未加载前用 kw
const defaultPlug = computed(() => app.plugOptions[0]?.value ?? 'kw')

// 卸载后丢弃迟到响应，避免渲染竞态
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

function onInputFocus() {
  history.value = loadSearchHistory()
  tipsOpen.value = true
}
function onInputBlur() {
  tipsOpen.value = false
}

// 搜索联想（防抖），与搜索页一致；失败静默降级为无联想
watchDebounced(
  keyword,
  async (kw) => {
    const q = kw.trim()
    if (!q) {
      tips.value = []
      return
    }
    try {
      const data = await musicApi.searchTips(defaultPlug.value, q)
      if (disposed) return
      tips.value = Array.isArray(data) ? data.slice(0, 8) : []
    } catch {
      if (disposed) return
      tips.value = []
    }
  },
  { debounce: 300 },
)

onClickOutside(searchBoxRef, () => (tipsOpen.value = false))

/** 快捷搜索：跳转搜索页，由 SearchView 读取 ?q= 触发搜索 */
function submitQuickSearch() {
  const q = keyword.value.trim()
  if (!q) return
  tipsOpen.value = false
  tips.value = []
  keyword.value = ''
  if (route.path === '/search' && route.query.q === q) return
  router.push({ path: '/search', query: { q } })
}

/** 点击联想词 / 历史词条：跳转搜索页执行搜索 */
function searchTerm(term: string) {
  tipsOpen.value = false
  tips.value = []
  keyword.value = ''
  if (route.path === '/search' && route.query.q === term) return
  router.push({ path: '/search', query: { q: term } })
}

function dropHistory(kw: string) {
  history.value = removeSearchHistory(kw)
}

function clearHistory() {
  history.value = clearSearchHistory()
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
    <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
      <RouterLink
        to="/search"
        class="flex items-center gap-2 rounded-md transition-opacity hover:opacity-75"
        title="回到搜索页"
      >
        <div class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Music2Icon class="size-4.5" />
        </div>
        <div class="leading-tight">
          <div class="text-sm font-semibold">MusicCopilot</div>
          <div
            class="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex"
            :title="statusTitle"
          >
            <span
              class="inline-block size-1.5 rounded-full"
              :class="app.connected ? 'bg-emerald-500' : 'bg-destructive animate-pulse'"
            />
            {{ app.connected ? '已连接' : app.statusMsg }}
          </div>
        </div>
      </RouterLink>

      <!-- 导航：靠左，仅音乐库 -->
      <nav class="flex items-center gap-1">
        <Button
          v-for="nav in navs"
          :key="nav.path"
          :variant="isActive(nav.path) ? 'secondary' : 'ghost'"
          size="sm"
          as-child
        >
          <RouterLink :to="nav.path">
            <component :is="nav.icon" class="size-4" />
            {{ nav.label }}
          </RouterLink>
        </Button>
      </nav>

      <div class="ml-auto flex items-center gap-1">
        <!-- 快捷搜索：聚焦显历史、输入显联想，选中/回车跳转搜索页（面板交互与搜索页一致） -->
        <div ref="searchBoxRef" class="relative mr-2 hidden md:block">
          <SearchIcon
            class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="keyword"
            data-search-input
            class="h-8 w-52 pl-8 pr-2 text-sm transition-[width] focus:w-72"
            placeholder="搜索歌曲 / 歌手 / 专辑"
            title="快捷搜索（回车跳转搜索页，按 / 聚焦）"
            @focus="onInputFocus"
            @click="onInputFocus"
            @blur="onInputBlur"
            @keydown.enter.prevent="submitQuickSearch"
            @keydown.esc="tipsOpen = false"
          />
          <!-- 搜索联想（输入时） -->
          <div
            v-if="tipsOpen && tips.length"
            class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md"
          >
            <button
              v-for="t in tips"
              :key="t"
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              @mousedown.prevent
              @click="searchTerm(t)"
            >
              <SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate">{{ t }}</span>
            </button>
          </div>
          <!-- 搜索历史：聚焦且未输入关键词时展示 -->
          <div
            v-else-if="tipsOpen && !keyword.trim() && history.length"
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

        <!-- 设置下拉：主题切换 / 系统设置（进入独立设置页） -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm" title="设置">
              <SettingsIcon class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuItem @click="toggleDark()">
              <SunIcon v-if="isDark" class="size-4" />
              <MoonIcon v-else class="size-4" />
              {{ isDark ? '切换浅色' : '切换深色' }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('showShortcuts')">
              <KeyboardIcon class="size-4" />
              快捷键
            </DropdownMenuItem>
            <DropdownMenuItem @click="router.push('/settings')">
              <SettingsIcon class="size-4" />
              系统设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>
</template>
