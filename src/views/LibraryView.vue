<script setup lang="ts">
import { DiscIcon, LibraryIcon, Music2Icon, UserRoundIcon } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getAlbumList,
  getArtistList,
  getGenreList,
  getTrackList,
  fnosCoverUrl,
} from '@/api/fnos'
import type { FnosAlbum, FnosArtist, FnosGenre, FnosTrack } from '@/api/fnosTypes'
import type { SongRecord } from '@/api/types'
import SongList from '@/components/SongList.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fnosTrackToRecord } from '@/lib/adapter'
import { useFnosStore } from '@/stores/fnos'

const PAGE_SIZE = 30

type TabKey = 'tracks' | 'albums' | 'artists' | 'genres'

const router = useRouter()
const fnos = useFnosStore()

const activeTab = ref<TabKey>('tracks')
const loginReady = ref(false)
const loginFailed = ref(false)

const tracks = ref<SongRecord[]>([])
const albums = ref<FnosAlbum[]>([])
const artists = ref<FnosArtist[]>([])
const genres = ref<FnosGenre[]>([])

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

async function load(page: number) {
  if (page < 1 || page > totalPages.value) return
  loading.value = true
  error.value = ''
  const tab = activeTab.value
  try {
    let list: unknown[] = []
    if (tab === 'tracks') {
      const data = await getTrackList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) tracks.value = list.map((t) => fnosTrackToRecord(t as FnosTrack))
    } else if (tab === 'albums') {
      const data = await getAlbumList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) albums.value = list as FnosAlbum[]
    } else if (tab === 'artists') {
      const data = await getArtistList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) artists.value = list as FnosArtist[]
    } else {
      const data = await getGenreList(page, PAGE_SIZE)
      list = data.list ?? []
      total.value = data.total ?? 0
      if (!disposed) genres.value = list as FnosGenre[]
    }
    if (disposed) return
    pageIndex.value = page
  } catch (e) {
    if (disposed) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!disposed) loading.value = false
  }
}

function goPage(page: number) {
  if (page < 1 || page > totalPages.value || loading.value) return
  load(page)
}

function openCollection(kind: 'album' | 'artist' | 'genre', guid: string) {
  router.push(`/library/collection/${kind}/${guid}`)
}

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
      <Button variant="outline" size="sm" class="mt-4" @click="router.go(0)">重试</Button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">音乐库</h1>
          <p class="mt-0.5 text-xs text-muted-foreground">
            飞牛 NAS 本地曲库{{ total ? ` · 共 ${total} 项` : '' }}
          </p>
        </div>
        <Tabs v-model="activeTab">
          <TabsList>
            <TabsTrigger value="tracks">歌曲</TabsTrigger>
            <TabsTrigger value="albums">专辑</TabsTrigger>
            <TabsTrigger value="artists">歌手</TabsTrigger>
            <TabsTrigger value="genres">流派</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div class="mt-4">
        <!-- 错误 -->
        <div v-if="error" class="py-12 text-center">
          <p class="text-sm text-destructive">{{ error }}</p>
          <Button variant="outline" size="sm" class="mt-3" @click="load(pageIndex)">重试</Button>
        </div>

        <!-- 歌曲 -->
        <template v-else-if="activeTab === 'tracks'">
          <div class="rounded-lg border py-1">
            <SongList :songs="tracks" :loading="loading" />
          </div>
          <p
            v-if="!loading && !tracks.length"
            class="py-12 text-center text-sm text-muted-foreground"
          >
            曲库为空
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

            <p
              v-if="!(activeTab === 'albums' ? albums : activeTab === 'artists' ? artists : genres).length"
              class="py-12 text-center text-sm text-muted-foreground"
            >
              暂无内容
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
    </template>
  </div>
</template>
