<script setup lang="ts">
import { Music2Icon, PlayIcon, UserRoundIcon } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import {
  fnosCoverUrl,
  getAlbumDetail,
  getArtistDetail,
  getGenreDetail,
  getPlaylistDetail,
  getTracksByAlbum,
  getTracksByArtist,
  getTracksByGenre,
  getTracksByPlaylist,
} from '@/api/fnos'
import type { FnosAlbum, FnosArtist, FnosGenre, FnosPlaylist, FnosTrack } from '@/api/fnosTypes'
import type { SongRecord } from '@/api/types'
import SongList from '@/components/SongList.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fnosTrackToRecord } from '@/lib/adapter'
import { usePlayerStore } from '@/stores/player'

const PAGE_SIZE = 50

const props = defineProps<{
  kind: 'album' | 'artist' | 'genre' | 'playlist'
  guid: string
}>()

const player = usePlayerStore()

const KIND_LABEL: Record<typeof props.kind, string> = {
  album: '专辑',
  artist: '歌手',
  genre: '流派',
  playlist: '歌单',
}

const detail = ref<FnosAlbum | FnosArtist | FnosGenre | FnosPlaylist | null>(null)
const tracks = ref<SongRecord[]>([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const detailLoading = ref(true)
const error = ref('')

// 卸载后丢弃迟到响应，避免与路由切换竞态
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

watch(() => [props.kind, props.guid], load, { immediate: true })

async function load() {
  detail.value = null
  tracks.value = []
  total.value = 0
  page.value = 0
  error.value = ''
  detailLoading.value = true
  // 头部信息来自 detail 接口；歌单详情失败不阻塞（曲目列表可正常展示）
  try {
    if (props.kind === 'album') detail.value = await getAlbumDetail(props.guid)
    else if (props.kind === 'artist') detail.value = await getArtistDetail(props.guid)
    else if (props.kind === 'genre') detail.value = await getGenreDetail(props.guid)
    else detail.value = await getPlaylistDetail(props.guid)
  } catch {
    detail.value = null
  } finally {
    if (!disposed) detailLoading.value = false
  }
  await loadTracks(true)
}

async function loadTracks(reset = false) {
  if (loading.value) return
  loading.value = true
  try {
    const nextPage = reset ? 1 : page.value + 1
    const kind = props.kind
    const data = await (kind === 'album'
      ? getTracksByAlbum(props.guid, nextPage, PAGE_SIZE)
      : kind === 'artist'
        ? getTracksByArtist(props.guid, nextPage, PAGE_SIZE)
        : kind === 'genre'
          ? getTracksByGenre(props.guid, nextPage, PAGE_SIZE)
          : getTracksByPlaylist(props.guid, nextPage, PAGE_SIZE))
    if (disposed) return
    let fresh: FnosTrack[] = data.list ?? []
    if (kind === 'album') {
      // 专辑内按碟号/曲号排序（曲号缺失的排最后）
      fresh = [...fresh].sort(
        (a, b) =>
          (Number(a.discNo) || 9999) - (Number(b.discNo) || 9999) ||
          (Number(a.trackNo) || 9999) - (Number(b.trackNo) || 9999),
      )
    }
    const mapped = fresh.map((t) => fnosTrackToRecord(t))
    tracks.value = reset ? mapped : [...tracks.value, ...mapped]
    total.value = data.total ?? tracks.value.length
    page.value = nextPage
  } catch (e) {
    if (disposed) return
    error.value = e instanceof Error ? e.message : String(e)
    toast.error('获取曲目列表失败', { description: error.value })
  } finally {
    if (!disposed) loading.value = false
  }
}

const hasMore = computed(() => tracks.value.length < total.value)

/** 专辑/歌手头部副信息 */
const detailArtists = computed(() => {
  const d = detail.value
  return d && 'artists' in d ? (d.artists ?? []).map((a) => a.name).join(' / ') : ''
})

function playAll() {
  if (!tracks.value.length) return
  player
    .playAll(tracks.value, 0)
    .catch((e) =>
      toast.error('播放失败', { description: e instanceof Error ? e.message : String(e) }),
    )
}

function hideImg(e: Event) {
  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6">
    <div v-if="detailLoading" class="flex gap-6">
      <Skeleton class="size-36 shrink-0 rounded-lg sm:size-44" />
      <div class="flex-1 space-y-3">
        <Skeleton class="h-7 w-64" />
        <Skeleton class="h-4 w-40" />
        <Skeleton class="h-9 w-52" />
      </div>
    </div>

    <template v-else>
      <!-- 合集头部（detail 接口失败时降级为基础信息） -->
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end">
        <div class="size-36 shrink-0 overflow-hidden rounded-lg bg-muted shadow-lg sm:size-44">
          <img
            v-if="fnosCoverUrl(detail?.coverId ?? null)"
            :src="fnosCoverUrl(detail?.coverId ?? null)!"
            :alt="detail?.name ?? ''"
            class="size-full object-cover"
            @error="hideImg"
          />
          <div v-else class="flex size-full items-center justify-center text-muted-foreground">
            <UserRoundIcon v-if="kind === 'artist'" class="size-12" />
            <Music2Icon v-else class="size-12" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <Badge variant="outline" class="shrink-0">{{ KIND_LABEL[kind] }}</Badge>
          <h1 class="mt-2 truncate text-2xl font-semibold" :title="detail?.name">
            {{ detail?.name ?? '未知' + KIND_LABEL[kind] }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <template v-if="kind === 'album' && detailArtists">
              <RouterLink
                v-if="detail && 'artists' in detail && detail.artists?.[0]"
                :to="`/library/collection/artist/${detail.artists[0].guid}`"
                class="font-medium text-foreground hover:underline"
              >{{ detailArtists }}</RouterLink>
              <span v-else class="font-medium text-foreground">{{ detailArtists }}</span>
            </template>
            <span v-if="detail && 'releaseDate' in detail && detail.releaseDate">
              · {{ detail.releaseDate.slice(0, 10) }}
            </span>
            <span v-if="detail && 'albumCount' in detail && detail.albumCount != null">
              · {{ detail.albumCount }} 张专辑
            </span>
            <span v-if="total">· {{ total }} 首歌曲</span>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" :disabled="!tracks.length" @click="playAll">
              <PlayIcon class="size-4" />
              播放全部
            </Button>
            <span
              v-if="player.song && tracks.some((s) => s.id === player.song?.id)"
              class="text-xs text-primary"
            >
              ♪ 正在播放本{{ KIND_LABEL[kind] }}
            </span>
          </div>
        </div>
      </div>

      <!-- 曲目列表 -->
      <section class="mt-8">
        <div class="rounded-lg border py-1">
          <SongList :songs="tracks" :loading="loading && !tracks.length" />
        </div>
        <p v-if="!loading && !tracks.length && !error" class="py-12 text-center text-sm text-muted-foreground">
          暂无曲目
        </p>
        <div v-if="hasMore && !error" class="mt-4 text-center">
          <Button variant="outline" size="sm" :disabled="loading" @click="loadTracks()">
            {{ loading ? '加载中...' : '加载更多' }}
          </Button>
        </div>
      </section>
    </template>
  </div>
</template>
