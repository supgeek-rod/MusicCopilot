<script setup lang="ts">
import { DiscIcon, LibraryIcon, ListMusicIcon, Music2Icon, SearchIcon, UserRoundIcon, XIcon } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import {
  getAlbumList,
  getArtistList,
  getGenreList,
  getPlaylists,
  getTrackList,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  searchTracks,
  fnosCoverUrl,
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
import { useFnosStore } from '@/stores/fnos'

const PAGE_SIZE = 30

type TabKey = 'tracks' | 'albums' | 'artists' | 'genres' | 'playlists'

const router = useRouter()
const fnos = useFnosStore()

const activeTab = ref<TabKey>('tracks')
const loginReady = ref(false)
const loginFailed = ref(false)

const keyword = ref('')
/** 非空即库内搜索模式：各 Tab 调用对应 search/* 接口 */
const query = ref('')

const tracks = ref<SongRecord[]>([])
const albums = ref<FnosAlbum[]>([])
const artists = ref<FnosArtist[]>([])
const genres = ref<FnosGenre[]>([])
const playlists = ref<FnosPlaylist[]>([])

const pageIndex = ref(1)
const total = ref(0)
const loading = ref(false)
const error = ref('')

// 卸载后丢弃迟到响应，避免与路由切换竞态
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

onMounted(async () => {
  loginReady.value = await fnos.ensureLogin()
  loginFailed.value = !loginReady.value
  if (loginReady.value) load(1)
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

watch(activeTab, () => {
  if (loginReady.value) load(1)
})

// 库内搜索：防抖 300ms（与搜索页联想一致）；清空关键词恢复浏览模式
watchDebounced(
  keyword,
  (kw) => {
    const q = kw.trim()
    if (q === query.value) return
    query.value = q
    if (loginReady.value) load(1)
  },
  { debounce: 300 },
)

function clearSearch() {
  keyword.value = ''
}

/** 登录失败重试：重新走登录流程并加载第一页（不整页刷新） */
const retrying = ref(false)
async function retryLogin() {
  retrying.value = true
  try {
    loginReady.value = await fnos.ensureLogin()
    loginFailed.value = !loginReady.value
    if (loginReady.value) {
      keyword.value = ''
      load(1)
    }
  } finally {
    retrying.value = false
  }
}

// 歌词弹窗（fnOS 曲目由 LyricDialog 内部分流取词）
const lyricOpen = ref(false)
const lyricSong = ref<SongRecord | null>(null)

function showLyrics(song: SongRecord) {
  lyricSong.value = song
  lyricOpen.value = true
}

async function load(page: number) {
  if (page < 1 || page > totalPages.value) return
  loading.value = true
  error.value = ''
  const tab = activeTab.value
  try {
    let list: unknown[] = []
    if (tab === 'tracks') {
      const data = query.value
        ? await searchTracks(query.value, page, PAGE_SIZE)
        : await getTrackList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) tracks.value = list.map((t) => fnosTrackToRecord(t as FnosTrack))
    } else if (tab === 'albums') {
      const data = query.value
        ? await searchAlbums(query.value, page, PAGE_SIZE)
        : await getAlbumList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) albums.value = list as FnosAlbum[]
    } else if (tab === 'artists') {
      const data = query.value
        ? await searchArtists(query.value, page, PAGE_SIZE)
        : await getArtistList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) artists.value = list as FnosArtist[]
    } else if (tab === 'playlists') {
      const data = query.value
        ? await searchPlaylists(query.value, page, PAGE_SIZE)
        : await getPlaylists(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) playlists.value = list as FnosPlaylist[]
    } else {
      const data = await getGenreList(page, PAGE_SIZE)
      let list = (data.list ?? []) as FnosGenre[]
      // fnOS 无 /search/genre 接口：流派数量少，搜索时对当前页做客户端过滤
      if (query.value) {
        const q = query.value.toLowerCase()
        list = list.filter((g) => g.name.toLowerCase().includes(q))
        total.value = list.length
      } else {
        total.value = data.total ?? 0
      }
      if (!disposed) genres.value = list
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

function goPage(page: number) {
  if (page < 1 || page > totalPages.value || loading.value) return
  load(page)
}

function openCollection(kind: 'album' | 'artist' | 'genre' | 'playlist', guid: string) {
  router.push(`/library/collection/${kind}/${guid}`)
}

/** 当前 Tab 的网格数据（专辑/歌手/流派/歌单共用空态判断） */
const gridItems = computed<unknown[]>(() =>
  activeTab.value === 'albums'
    ? albums.value
    : activeTab.value === 'artists'
      ? artists.value
      : activeTab.value === 'genres'
        ? genres.value
        : activeTab.value === 'playlists'
          ? playlists.value
          : [],
)

function artistNames(a: FnosAlbum): string {
  return (a.artists ?? []).map((x) => x.name).join(' / ') || '未知歌手'
}

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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">音乐库</h1>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{
              query
                ? `搜索「${query}」 · ${total} 个结果`
                : `飞牛 NAS 本地曲库${total ? ` · 共 ${total} 项` : ''}`
            }}
          </p>
        </div>
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

      <div class="mt-4">
        <!-- 库内搜索（当前 Tab 范围内） -->
        <div class="relative">
          <SearchIcon
            class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="keyword"
            class="pr-8"
            :placeholder="
              activeTab === 'tracks'
                ? '搜索曲库中的歌曲'
                : activeTab === 'albums'
                  ? '搜索曲库中的专辑'
                  : activeTab === 'artists'
                    ? '搜索曲库中的歌手'
                    : activeTab === 'genres'
                      ? '搜索流派'
                      : '搜索歌单'
            "
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

        <!-- 错误 -->
        <div v-if="error" class="py-12 text-center">
          <p class="text-sm text-destructive">{{ error }}</p>
          <Button variant="outline" size="sm" class="mt-3" @click="load(pageIndex)">重试</Button>
        </div>

        <!-- 歌曲 -->
        <template v-else-if="activeTab === 'tracks'">
          <div class="rounded-lg border py-1">
            <SongList :songs="tracks" :loading="loading" @lyrics="showLyrics" />
          </div>
          <p
            v-if="!loading && !tracks.length"
            class="py-12 text-center text-sm text-muted-foreground"
          >
            {{ query ? '未找到匹配的歌曲' : '曲库为空' }}
          </p>
        </template>

        <!-- 专辑 / 歌手 / 流派：卡片网格 -->
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

            <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

            <!-- 歌单 -->
            <div
              v-if="activeTab === 'playlists'"
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

            <p
              v-if="!gridItems.length"
              class="py-12 text-center text-sm text-muted-foreground"
            >
              {{ query ? '未找到匹配内容' : '暂无内容' }}
            </p>
          </template>
        </template>
      </div>

      <!-- 分页（与搜索页一致的极简上一页/下一页） -->
      <div
        v-if="totalPages > 1 && !error"
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
