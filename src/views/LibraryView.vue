<script setup lang="ts">
import {
  ArrowLeftIcon,
  DiscIcon,
  LibraryIcon,
  ListMusicIcon,
  Music2Icon,
  PlayIcon,
  SearchIcon,
  ShuffleIcon,
  UserRoundIcon,
  XIcon,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import {
  fnosCoverUrl,
  getAlbumList,
  getArtistList,
  getGenreList,
  getPlaylists,
  getRandomTracks,
  getTrackList,
  searchAlbums,
  searchArtists,
  searchTracks,
} from '@/api/fnos'
import type { FnosAlbum, FnosArtist, FnosGenre, FnosPlaylist, FnosTrack } from '@/api/fnosTypes'
import type { SongRecord } from '@/api/types'
import LyricDialog from '@/components/LyricDialog.vue'
import SongList from '@/components/SongList.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fnosTrackToRecord } from '@/lib/adapter'
import { loadRecentPlays } from '@/lib/recentPlays'
import { useFnosStore } from '@/stores/fnos'
import { usePlayerStore } from '@/stores/player'

const BROWSE_SIZE = 30
const SHELF_SIZE = 12

type TabKey = 'tracks' | 'albums' | 'artists' | 'genres' | 'playlists'

const router = useRouter()
const fnos = useFnosStore()
const player = usePlayerStore()

/** home：快捷播放首页（搜索 + 随便听听 + 最近）；browse：按歌曲/专辑/歌手/流派/歌单翻页浏览 */
const view = ref<'home' | 'browse'>('home')
const loginReady = ref(false)
const loginFailed = ref(false)

const keyword = ref('')
/** 防抖后的有效关键词，非空即搜索态（内容区被搜索结果覆盖） */
const query = ref('')

// ── 首页数据 ──
const trackTotal = ref(0)
const recentAdded = ref<SongRecord[]>([])
const recentPlayed = ref<SongRecord[]>([])
const homeLoading = ref(false)
const roaming = ref(false)

// ── 搜索结果 ──
const searching = ref(false)
const searchTotal = ref(0)
const searchTracksList = ref<SongRecord[]>([])
const searchAlbumHits = ref<FnosAlbum[]>([])
const searchArtistHits = ref<FnosArtist[]>([])
let searchSeq = 0

// ── 浏览数据 ──
const activeTab = ref<TabKey>('tracks')
const tracks = ref<SongRecord[]>([])
const albums = ref<FnosAlbum[]>([])
const artists = ref<FnosArtist[]>([])
const genres = ref<FnosGenre[]>([])
const playlists = ref<FnosPlaylist[]>([])
const pageIndex = ref(1)
const total = ref(0)
const loading = ref(false)
const error = ref('')

const isSearch = computed(() => query.value !== '')

// 卸载后丢弃迟到响应，避免与路由切换竞态
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

onMounted(async () => {
  refreshRecentPlayed()
  loginReady.value = await fnos.ensureLogin()
  loginFailed.value = !loginReady.value
  if (loginReady.value) loadHome()
})

/** 最近播放来自本地播放记录（player.jump 时写入），跟随切歌即时刷新 */
function refreshRecentPlayed() {
  recentPlayed.value = loadRecentPlays().filter((s) => s.plugName === 'fnos').slice(0, SHELF_SIZE)
}
watch(
  () => player.playSeq,
  () => refreshRecentPlayed(),
)

// ── 首页：最近添加（按入库时间倒序）──
let homeSeq = 0
async function loadHome() {
  const seq = ++homeSeq
  homeLoading.value = true
  try {
    const data = await getTrackList(1, SHELF_SIZE, 'createdAt,desc')
    if (disposed || seq !== homeSeq) return
    recentAdded.value = (data.list ?? []).map((t) => fnosTrackToRecord(t as FnosTrack))
    trackTotal.value = data.total ?? 0
  } catch {
    // 静默降级为空态（登录已在 ensureLogin 阶段校验过）
    if (disposed || seq !== homeSeq) return
    recentAdded.value = []
    trackTotal.value = 0
  } finally {
    if (!disposed && seq === homeSeq) homeLoading.value = false
  }
}

// ── 库内统一搜索：歌曲 + 专辑 + 歌手并行（fnOS 无流派搜索）──
watchDebounced(
  keyword,
  (kw) => {
    const q = kw.trim()
    if (q === query.value) return
    query.value = q
    if (q && loginReady.value) runSearch()
  },
  { debounce: 300 },
)

async function runSearch() {
  const q = query.value
  if (!q) return
  const seq = ++searchSeq
  searching.value = true
  error.value = ''
  try {
    const [t, a, ar] = await Promise.all([
      searchTracks(q, 1, 50),
      searchAlbums(q, 1, SHELF_SIZE),
      searchArtists(q, 1, SHELF_SIZE),
    ])
    if (disposed || seq !== searchSeq) return
    searchTracksList.value = (t.list ?? []).map((x) => fnosTrackToRecord(x as FnosTrack))
    searchAlbumHits.value = (a.list ?? []) as FnosAlbum[]
    searchArtistHits.value = (ar.list ?? []) as FnosArtist[]
    searchTotal.value = t.total ?? 0
  } catch (e) {
    if (disposed || seq !== searchSeq) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!disposed && seq === searchSeq) searching.value = false
  }
}

/** 回车：立即搜索并整组播放命中歌曲（最短路径：输入 → 出声）；同词重按直接重播结果 */
async function onSearchEnter() {
  const q = keyword.value.trim()
  if (!q) return
  const reusable = q === query.value && searchTracksList.value.length > 0 && !searching.value
  query.value = q
  if (!reusable) await runSearch()
  playAllSongs(searchTracksList.value)
}

function clearSearch() {
  keyword.value = ''
  query.value = ''
}

// ── 随便听听：随机取样整组连播 ──
async function playRandom() {
  if (roaming.value) return
  roaming.value = true
  try {
    const list = await getRandomTracks(30)
    if (disposed) return
    const songs = list.map((t) => fnosTrackToRecord(t))
    if (songs.length) await player.playAll(songs, 0)
    else toast.info('曲库为空，先去下载几首歌吧')
  } catch (e) {
    toast.error('随机播放失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    roaming.value = false
  }
}

/** 点击卡片/歌曲行：已在队列切到该首，否则追加队尾并播放 */
async function playSong(song: SongRecord) {
  try {
    await player.playNow(song)
  } catch (e) {
    toast.error('播放失败', { description: e instanceof Error ? e.message : String(e) })
  }
}

/** 整组播放（搜索回车/合集播放全部同款） */
async function playAllSongs(songs: SongRecord[]) {
  if (!songs.length) return
  try {
    await player.playAll(songs, 0)
  } catch (e) {
    toast.error('播放失败', { description: e instanceof Error ? e.message : String(e) })
  }
}

// ── 浏览模式：进入时按需加载，Tab 切换重载第一页 ──
function openBrowse(tab: TabKey) {
  view.value = 'browse'
  if (activeTab.value === tab) {
    if (!gridItemsFor(tab).length && !loading.value) load(1)
  } else {
    activeTab.value = tab // watch 触发 load(1)
  }
}

watch(activeTab, () => {
  if (view.value === 'browse' && loginReady.value) load(1)
})

async function load(page: number) {
  if (page < 1 || page > totalPages.value) return
  loading.value = true
  error.value = ''
  const tab = activeTab.value
  try {
    let list: unknown[] = []
    if (tab === 'tracks') {
      const data = await getTrackList(page, BROWSE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) tracks.value = list.map((t) => fnosTrackToRecord(t as FnosTrack))
    } else if (tab === 'albums') {
      const data = await getAlbumList(page, BROWSE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) albums.value = list as FnosAlbum[]
    } else if (tab === 'artists') {
      const data = await getArtistList(page, BROWSE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) artists.value = list as FnosArtist[]
    } else if (tab === 'playlists') {
      const data = await getPlaylists(page, BROWSE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) playlists.value = list as FnosPlaylist[]
    } else {
      const data = await getGenreList(page, BROWSE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) genres.value = list as FnosGenre[]
    }
    if (disposed) return
    pageIndex.value = page
  } catch (e) {
    if (disposed) return
    // 失败时清空列表并复位分页，避免沿用上一个 Tab/页码的 total 显示「第 3 / 1 页」
    tracks.value = []
    albums.value = []
    artists.value = []
    genres.value = []
    playlists.value = []
    total.value = 0
    pageIndex.value = 1
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!disposed) loading.value = false
  }
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / BROWSE_SIZE)))

function goPage(page: number) {
  if (page < 1 || page > totalPages.value || loading.value) return
  load(page)
}

function openCollection(kind: 'album' | 'artist' | 'genre' | 'playlist', guid: string) {
  router.push(`/library/collection/${kind}/${guid}`)
}

function gridItemsFor(tab: TabKey): unknown[] {
  return tab === 'albums'
    ? albums.value
    : tab === 'artists'
      ? artists.value
      : tab === 'genres'
        ? genres.value
        : tab === 'playlists'
          ? playlists.value
          : tracks.value
}

const gridItems = computed<unknown[]>(() => gridItemsFor(activeTab.value))

function artistNames(a: FnosAlbum): string {
  return (a.artists ?? []).map((x) => x.name).join(' / ') || '未知歌手'
}

function showLyrics(song: SongRecord) {
  lyricSong.value = song
  lyricOpen.value = true
}

/** 登录失败重试：重新走登录流程并加载首页数据（不整页刷新） */
const retrying = ref(false)
async function retryLogin() {
  retrying.value = true
  try {
    loginReady.value = await fnos.ensureLogin()
    loginFailed.value = !loginReady.value
    if (loginReady.value) {
      keyword.value = ''
      query.value = ''
      loadHome()
    }
  } finally {
    retrying.value = false
  }
}

// 歌词弹窗（fnOS 曲目由 LyricDialog 内部分流取词）
const lyricOpen = ref(false)
const lyricSong = ref<SongRecord | null>(null)

function hideImg(e: Event) {
  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6">
    <!-- 未启用 / 登录失败 -->
    <div v-if="!fnos.enabled" class="rounded-lg border border-dashed p-8 text-center">
      <LibraryIcon class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-3 text-sm font-medium">音乐库未启用</p>
      <p class="mt-1 text-xs text-muted-foreground">
        请在 .env 中配置 MC_FNOS_BASE_URL（fnOS 网关地址）后重启服务
      </p>
    </div>
    <div v-else-if="loginFailed" class="rounded-lg border border-dashed p-8 text-center">
      <p class="text-sm font-medium text-destructive">飞牛音乐登录失败</p>
      <p class="mt-1 text-xs text-muted-foreground">
        请检查 .env 中 MC_FNOS_USERNAME / MC_FNOS_PASSWORD 配置与 NAS 网络
      </p>
      <Button variant="outline" size="sm" class="mt-4" :disabled="retrying" @click="retryLogin">
        {{ retrying ? '重试中…' : '重试' }}
      </Button>
    </div>

    <template v-else>
      <!-- 工具栏：搜索框 + 随便听听；浏览/搜索态附返回按钮 -->
      <div class="mb-4 flex items-center gap-2">
        <Button
          v-if="view !== 'home' || isSearch"
          variant="ghost"
          size="icon-sm"
          title="返回音乐库首页"
          @click="clearSearch(); view = 'home'"
        >
          <ArrowLeftIcon class="size-4" />
        </Button>
        <div class="relative flex-1">
          <SearchIcon
            class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="keyword"
            data-search-input
            class="pr-8 pl-8"
            placeholder="搜索歌曲、歌手、专辑，回车播放"
            @keydown.enter.prevent="onSearchEnter"
            @keydown.esc="clearSearch"
          />
          <button
            v-if="keyword"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="清空搜索"
            @click="clearSearch"
          >
            <XIcon class="size-4" />
          </button>
        </div>
        <Button size="sm" class="h-9 shrink-0 px-3" :disabled="roaming || homeLoading" @click="playRandom">
          <ShuffleIcon class="size-4" />
          {{ roaming ? '挑选中…' : '随便听听' }}
        </Button>
      </div>

      <!-- 浏览模式的 Tab（搜索态下隐藏，结果直接覆盖内容区） -->
      <div v-if="view === 'browse' && !isSearch" class="mt-4">
        <Tabs v-model="activeTab">
          <TabsList>
            <TabsTrigger value="tracks">歌曲</TabsTrigger>
            <TabsTrigger value="albums">专辑</TabsTrigger>
            <TabsTrigger value="artists">歌手</TabsTrigger>
            <TabsTrigger value="genres">流派</TabsTrigger>
            <TabsTrigger value="playlists">歌单</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div class="mt-5">
        <!-- 错误（搜索与浏览共用） -->
        <div v-if="error" class="py-12 text-center">
          <p class="text-sm text-destructive">{{ error }}</p>
          <Button variant="outline" size="sm" class="mt-3" @click="isSearch ? runSearch() : load(pageIndex)">
            重试
          </Button>
        </div>

        <!-- ══ 搜索结果 ══ -->
        <template v-else-if="isSearch">
          <div v-if="searching" class="space-y-2">
            <Skeleton v-for="i in 6" :key="i" class="h-12 w-full rounded-lg" />
          </div>

          <template v-else>
            <!-- 歌曲命中 -->
            <template v-if="searchTracksList.length">
              <p class="mb-2 text-xs text-muted-foreground">找到 {{ searchTotal }} 首，回车从第一首开始播放</p>
              <div class="rounded-lg border py-1">
                <SongList :songs="searchTracksList" :loading="false" @lyrics="showLyrics" />
              </div>
            </template>
            <p
              v-else
              class="py-10 text-center text-sm text-muted-foreground"
            >
              未找到与「{{ query }}」匹配的歌曲
            </p>

            <!-- 专辑 / 歌手命中：横滑入口 -->
            <section v-if="searchAlbumHits.length" class="mt-6">
              <h2 class="mb-2 text-sm font-medium text-muted-foreground">相关专辑</h2>
              <div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                <button
                  v-for="a in searchAlbumHits"
                  :key="a.guid"
                  type="button"
                  class="group w-28 shrink-0 text-left"
                  @click="openCollection('album', a.guid)"
                >
                  <div class="aspect-square w-full overflow-hidden rounded-md bg-muted">
                    <img
                      v-if="fnosCoverUrl(a.coverId)"
                      :src="fnosCoverUrl(a.coverId)!"
                      :alt="a.name"
                      class="size-full object-cover"
                      loading="lazy"
                      @error="hideImg"
                    />
                    <div v-else class="flex size-full items-center justify-center">
                      <DiscIcon class="size-7 text-muted-foreground" />
                    </div>
                  </div>
                  <div class="mt-1.5 truncate text-sm font-medium" :title="a.name">{{ a.name }}</div>
                </button>
              </div>
            </section>

            <section v-if="searchArtistHits.length" class="mt-6">
              <h2 class="mb-2 text-sm font-medium text-muted-foreground">相关歌手</h2>
              <div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                <button
                  v-for="a in searchArtistHits"
                  :key="a.guid"
                  type="button"
                  class="group w-28 shrink-0 text-left"
                  @click="openCollection('artist', a.guid)"
                >
                  <div class="aspect-square w-full overflow-hidden rounded-md bg-muted">
                    <img
                      v-if="fnosCoverUrl(a.coverId)"
                      :src="fnosCoverUrl(a.coverId)!"
                      :alt="a.name"
                      class="size-full object-cover"
                      loading="lazy"
                      @error="hideImg"
                    />
                    <div v-else class="flex size-full items-center justify-center">
                      <UserRoundIcon class="size-7 text-muted-foreground" />
                    </div>
                  </div>
                  <div class="mt-1.5 truncate text-sm font-medium" :title="a.name">{{ a.name }}</div>
                </button>
              </div>
            </section>
          </template>
        </template>

        <!-- ══ 首页内容 ══ -->
        <template v-else-if="view === 'home'">
          <!-- 最近添加 -->
          <section>
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-medium text-muted-foreground">最近添加</h2>
              <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground"
                @click="openBrowse('tracks')"
              >
                全部歌曲 →
              </button>
            </div>
            <div v-if="homeLoading" class="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-12">
              <div v-for="i in SHELF_SIZE" :key="i">
                <Skeleton class="aspect-square w-full rounded-md" />
                <Skeleton class="mt-1.5 h-3.5 w-3/4" />
              </div>
            </div>
            <div v-else class="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-12">
              <button
                v-for="s in recentAdded"
                :key="s.id"
                type="button"
                class="group text-left"
                title="播放"
                @click="playSong(s)"
              >
                <div class="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
                  <img
                    v-if="s.pic"
                    :src="s.pic"
                    :alt="s.name"
                    class="size-full object-cover"
                    loading="lazy"
                    @error="hideImg"
                  />
                  <div
                    v-else
                    class="flex size-full items-center justify-center"
                  >
                    <Music2Icon class="size-7 text-muted-foreground" />
                  </div>
                  <div
                    class="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex"
                  >
                    <PlayIcon class="size-8 text-white" />
                  </div>
                </div>
                <div class="mt-1.5 truncate text-sm font-medium" :title="s.name">{{ s.name }}</div>
                <div class="truncate text-xs text-muted-foreground">
                  {{ s.artistName?.join(' / ') || '未知歌手' }}
                </div>
              </button>
            </div>
            <p v-if="!homeLoading && !recentAdded.length" class="py-6 text-center text-sm text-muted-foreground">
              曲库为空
            </p>
          </section>

          <!-- 最近播放（本地记录，空则隐藏） -->
          <section v-if="recentPlayed.length" class="mt-6">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-medium text-muted-foreground">最近播放</h2>
              <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground"
                @click="playAllSongs(recentPlayed)"
              >
                全部播放 →
              </button>
            </div>
            <div class="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-12">
              <button
                v-for="s in recentPlayed"
                :key="s.id"
                type="button"
                class="group text-left"
                title="播放"
                @click="playSong(s)"
              >
                <div class="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
                  <img
                    v-if="s.pic"
                    :src="s.pic"
                    :alt="s.name"
                    class="size-full object-cover"
                    loading="lazy"
                    @error="hideImg"
                  />
                  <div v-else class="flex size-full items-center justify-center">
                    <Music2Icon class="size-7 text-muted-foreground" />
                  </div>
                  <div
                    class="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex"
                  >
                    <PlayIcon class="size-8 text-white" />
                  </div>
                </div>
                <div class="mt-1.5 truncate text-sm font-medium" :title="s.name">{{ s.name }}</div>
                <div class="truncate text-xs text-muted-foreground">
                  {{ s.artistName?.join(' / ') || '未知歌手' }}
                </div>
              </button>
            </div>
          </section>

          <!-- 浏览入口 -->
          <section class="mt-6">
            <h2 class="mb-2 text-sm font-medium text-muted-foreground">浏览曲库</h2>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                v-for="entry in [
                  { tab: 'albums', label: '专辑', icon: DiscIcon },
                  { tab: 'artists', label: '歌手', icon: UserRoundIcon },
                  { tab: 'genres', label: '流派', icon: Music2Icon },
                  { tab: 'playlists', label: '歌单', icon: ListMusicIcon },
                ] as const"
                :key="entry.tab"
                type="button"
                class="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/60"
                @click="openBrowse(entry.tab)"
              >
                <component :is="entry.icon" class="size-5 text-muted-foreground" />
                <span class="text-sm font-medium">{{ entry.label }}</span>
              </button>
            </div>
          </section>
        </template>

        <!-- ══ 浏览内容 ══ -->
        <template v-else>
          <!-- 歌曲 -->
          <template v-if="activeTab === 'tracks'">
            <div class="rounded-lg border py-1">
              <SongList :songs="tracks" :loading="loading" @lyrics="showLyrics" />
            </div>
            <p
              v-if="!loading && !tracks.length"
              class="py-12 text-center text-sm text-muted-foreground"
            >
              曲库为空
            </p>
          </template>

          <!-- 专辑 / 歌手 / 流派 / 歌单：卡片网格（分支显式限定，勿用 v-else 兜底） -->
          <template v-else>
            <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div v-for="i in 8" :key="i" class="rounded-lg border p-3">
                <Skeleton class="aspect-square w-full rounded-md" />
                <Skeleton class="mt-2 h-4 w-2/3" />
                <Skeleton class="mt-1.5 h-3 w-1/2" />
              </div>
            </div>

            <template v-else>
              <div
                v-if="activeTab === 'albums'"
                class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                <button
                  v-for="a in albums"
                  :key="a.guid"
                  type="button"
                  class="group rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                  @click="openCollection('album', a.guid)"
                >
                  <div class="aspect-square w-full overflow-hidden rounded-md bg-muted">
                    <img
                      v-if="fnosCoverUrl(a.coverId)"
                      :src="fnosCoverUrl(a.coverId)!"
                      :alt="a.name"
                      class="size-full object-cover"
                      loading="lazy"
                      @error="hideImg"
                    />
                    <div v-else class="flex size-full items-center justify-center">
                      <DiscIcon class="size-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div class="mt-2 truncate text-sm font-medium" :title="a.name">{{ a.name }}</div>
                  <div class="truncate text-xs text-muted-foreground">
                    {{ artistNames(a) }} · {{ a.trackCount ?? '?' }} 首
                  </div>
                </button>
              </div>

              <div
                v-else-if="activeTab === 'artists'"
                class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                <button
                  v-for="a in artists"
                  :key="a.guid"
                  type="button"
                  class="group rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                  @click="openCollection('artist', a.guid)"
                >
                  <div class="aspect-square w-full overflow-hidden rounded-md bg-muted">
                    <img
                      v-if="fnosCoverUrl(a.coverId)"
                      :src="fnosCoverUrl(a.coverId)!"
                      :alt="a.name"
                      class="size-full object-cover"
                      loading="lazy"
                      @error="hideImg"
                    />
                    <div v-else class="flex size-full items-center justify-center">
                      <UserRoundIcon class="size-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div class="mt-2 truncate text-sm font-medium" :title="a.name">{{ a.name }}</div>
                  <div class="truncate text-xs text-muted-foreground">
                    {{ a.trackCount ?? '?' }} 首歌曲 · {{ a.albumCount ?? '?' }} 张专辑
                  </div>
                </button>
              </div>

              <div
                v-else-if="activeTab === 'genres'"
                class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                <button
                  v-for="g in genres"
                  :key="g.guid"
                  type="button"
                  class="group rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                  @click="openCollection('genre', g.guid)"
                >
                  <div class="aspect-square w-full overflow-hidden rounded-md bg-muted">
                    <img
                      v-if="fnosCoverUrl(g.coverId)"
                      :src="fnosCoverUrl(g.coverId)!"
                      :alt="g.name"
                      class="size-full object-cover"
                      loading="lazy"
                      @error="hideImg"
                    />
                    <div v-else class="flex size-full items-center justify-center">
                      <Music2Icon class="size-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div class="mt-2 truncate text-sm font-medium" :title="g.name">{{ g.name }}</div>
                  <div class="truncate text-xs text-muted-foreground">
                    {{ g.trackCount ?? '?' }} 首歌曲
                  </div>
                </button>
              </div>

              <div
                v-else-if="activeTab === 'playlists'"
                class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                <button
                  v-for="p in playlists"
                  :key="p.guid"
                  type="button"
                  class="group rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                  @click="openCollection('playlist', p.guid)"
                >
                  <div class="aspect-square w-full overflow-hidden rounded-md bg-muted">
                    <img
                      v-if="fnosCoverUrl(p.coverId)"
                      :src="fnosCoverUrl(p.coverId)!"
                      :alt="p.name"
                      class="size-full object-cover"
                      loading="lazy"
                      @error="hideImg"
                    />
                    <div v-else class="flex size-full items-center justify-center">
                      <ListMusicIcon class="size-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div class="mt-2 truncate text-sm font-medium" :title="p.name">{{ p.name }}</div>
                  <div class="truncate text-xs text-muted-foreground">
                    {{ p.trackCount ?? '?' }} 首歌曲
                  </div>
                </button>
              </div>

              <p v-if="!gridItems.length" class="py-12 text-center text-sm text-muted-foreground">
                暂无内容
              </p>
            </template>
          </template>
        </template>
      </div>

      <!-- 浏览模式分页（与搜索页一致的极简上一页/下一页） -->
      <div
        v-if="view === 'browse' && !isSearch && totalPages > 1 && !error"
        class="mt-5 flex items-center justify-center gap-3 text-sm text-muted-foreground"
      >
        <Button variant="outline" size="sm" :disabled="pageIndex <= 1 || loading" @click="goPage(pageIndex - 1)">
          上一页
        </Button>
        <span>第 {{ pageIndex }} / {{ totalPages }} 页</span>
        <Button
          variant="outline"
          size="sm"
          :disabled="pageIndex >= totalPages || loading"
          @click="goPage(pageIndex + 1)"
        >
          下一页
        </Button>
      </div>

      <LyricDialog v-model:open="lyricOpen" :song="lyricSong" />
    </template>
  </div>
</template>
