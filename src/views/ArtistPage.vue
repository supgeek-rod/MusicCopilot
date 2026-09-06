<script setup lang="ts">
import { DownloadIcon, LoaderCircleIcon, Music2Icon, PlayIcon } from '@lucide/vue'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { musicApi } from '@/api/music'
import type { AlbumDetailRecord, ArtistInfo, SongRecord } from '@/api/types'
import SongList from '@/components/SongList.vue'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { albumDetailToSearchRecord } from '@/lib/adapter'
import { useSanitizedHtml } from '@/lib/sanitize'
import { usePlayerStore } from '@/stores/player'

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()

const plug = computed(() => String(route.params.plug))
const artistId = computed(() => String(route.params.id))

const info = ref<ArtistInfo | null>(null)
const albums = ref<AlbumDetailRecord[]>([])
const infoLoading = ref(false)
const infoError = ref('')

const songs = ref<SongRecord[]>([])
const songTotal = ref(0)
const songsLoading = ref(false)
const songPage = ref(0)
let hasDupPage = false

const expanded = ref(false)
const describe = useSanitizedHtml(() => info.value?.musicArtistsDescribe)

const confirm = reactive<{
  open: boolean
  title: string
  desc: string
  action: (() => Promise<void>) | null
}>({ open: false, title: '', desc: '', action: null })

const hasMore = computed(
  () => songTotal.value > 0 && songs.value.length < songTotal.value && !hasDupPage,
)

watch([plug, artistId], loadAll, { immediate: true })

// 卸载后丢弃迟到响应，避免与路由切换竞态；两级序号分别使旧的歌手详情与歌曲分页请求失效
let disposed = false
let artistSeq = 0
let songsSeq = 0
onBeforeUnmount(() => {
  disposed = true
})

async function loadAll() {
  const seq = ++artistSeq
  info.value = null
  albums.value = []
  songs.value = []
  songPage.value = 0
  songTotal.value = 0
  infoError.value = ''
  infoLoading.value = true
  try {
    const data = await musicApi.artistAlbumById(plug.value, artistId.value)
    if (disposed || seq !== artistSeq) return
    info.value = data
    albums.value = data.albums ?? []
    await loadSongs(true)
  } catch (e) {
    if (disposed || seq !== artistSeq) return
    infoError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!disposed && seq === artistSeq) infoLoading.value = false
  }
}

async function loadSongs(reset = false) {
  if (!info.value?.musicArtistsName) return
  const seq = ++songsSeq
  const seqAtStart = artistSeq
  songsLoading.value = true
  try {
    const page = reset ? 1 : songPage.value + 1
    const data = await musicApi.searchSong(plug.value, info.value.musicArtistsName, page, PAGE_SIZE)
    // 歌手已切换（artistSeq 变化）或有更新的分页请求时丢弃本次结果
    if (disposed || seq !== songsSeq || seqAtStart !== artistSeq) return
    const fresh = (data.records ?? []).filter(
      (s) => !songs.value.some((old) => old.id === s.id),
    )
    hasDupPage = !reset && fresh.length === 0
    songs.value = reset ? fresh : [...songs.value, ...fresh]
    songTotal.value = data.searchTotal ?? songs.value.length
    songPage.value = page
  } catch (e) {
    if (disposed || seq !== songsSeq || seqAtStart !== artistSeq) return
    toast.error('获取歌手歌曲失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    if (!disposed && seq === songsSeq) songsLoading.value = false
  }
}

function playAll() {
  if (!songs.value.length) return
  player.playAll(songs.value, 0).catch((e) =>
    toast.error('获取试听链接失败', { description: e instanceof Error ? e.message : String(e) }),
  )
}

function hideImg(e: Event) {
  ;(e.target as HTMLImageElement).style.opacity = '0'
}

function askConfirm(title: string, desc: string, action: () => Promise<void>) {
  confirm.title = title
  confirm.desc = desc
  confirm.action = action
  confirm.open = true
}

async function runConfirm() {
  const action = confirm.action
  if (!action) return
  try {
    await action()
  } finally {
    confirm.open = false
  }
}

function queueAlbum(a: AlbumDetailRecord) {
  askConfirm(
    '下载整张专辑',
    `将把「${a.albumName}」的全部歌曲加入服务器下载队列（默认音质）。`,
    async () => {
      try {
        await musicApi.downloadAlbum(albumDetailToSearchRecord(a, plug.value))
        toast.success('专辑已加入下载队列', { description: a.albumName })
      } catch (e) {
        toast.error('加入下载队列失败', { description: e instanceof Error ? e.message : String(e) })
      }
    },
  )
}

function queueAllAlbums() {
  if (!info.value) return
  askConfirm(
    '下载全部专辑',
    `将下载 ${info.value.musicArtistsName} 的全部 ${albums.value.length} 张专辑，任务数量可能非常大，确定继续吗？`,
    async () => {
      try {
        await musicApi.downloadArtistAlbum({
          artistName: info.value!.musicArtistsName,
          artistid: artistId.value,
          pic: info.value!.musicArtistsPhoto ?? undefined,
          plugName: plug.value,
        })
        toast.success('全部专辑已加入下载队列')
      } catch (e) {
        toast.error('加入下载队列失败', { description: e instanceof Error ? e.message : String(e) })
      }
    },
  )
}
</script>

<template>
  <div>
    <!-- 歌手头部 -->
    <div v-if="infoLoading" class="flex items-center gap-5">
      <div class="size-28 shrink-0 animate-pulse rounded-full bg-muted sm:size-32" />
      <div class="flex-1 space-y-3">
        <div class="h-6 w-48 animate-pulse rounded bg-muted" />
        <div class="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="infoError" class="py-16 text-center">
      <p class="text-sm text-destructive">{{ infoError }}</p>
      <Button variant="outline" size="sm" class="mt-3" @click="loadAll">重试</Button>
    </div>

    <div v-else-if="info" class="flex items-center gap-5">
      <div class="relative size-28 shrink-0 overflow-hidden rounded-full bg-muted sm:size-32">
        <img
          v-if="info.musicArtistsPhoto"
          :src="info.musicArtistsPhoto"
          :alt="info.musicArtistsName"
          class="size-full object-cover"
          @error="hideImg"
        />
        <div v-else class="flex size-full items-center justify-center text-muted-foreground">
          <Music2Icon class="size-10" />
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-2xl font-semibold">{{ info.musicArtistsName }}</h1>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{{ albums.length }} 张专辑</Badge>
          <Badge v-if="songTotal" variant="secondary">{{ songTotal }} 首歌曲</Badge>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" :disabled="!songs.length" @click="playAll">
            <PlayIcon class="size-4" />
            播放全部
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="!albums.length"
            @click="queueAllAlbums"
          >
            <DownloadIcon class="size-4" />
            下载全部专辑
          </Button>
        </div>
      </div>
    </div>

    <!-- 全部歌曲 -->
    <section class="mt-8">
      <h2 class="mb-2 text-lg font-semibold">全部歌曲</h2>
      <div class="rounded-lg border py-1">
        <SongList :songs="songs" :loading="songsLoading && !songs.length" />
        <div v-if="!infoLoading && !songs.length" class="py-12 text-center text-sm text-muted-foreground">
          暂无歌曲
        </div>
      </div>
      <div v-if="hasMore" class="mt-4 flex justify-center">
        <Button variant="outline" size="sm" :disabled="songsLoading" @click="loadSongs()">
          <LoaderCircleIcon v-if="songsLoading" class="size-4 animate-spin" />
          加载更多
        </Button>
      </div>
    </section>

    <!-- 全部专辑 -->
    <section v-if="albums.length" class="mt-10">
      <h2 class="mb-3 text-lg font-semibold">全部专辑</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div
          v-for="a in albums"
          :key="a.albumId"
          class="group relative cursor-pointer"
          @click="router.push(`/album/${plug}/${a.albumId}`)"
        >
          <div class="relative overflow-hidden rounded-lg bg-muted">
            <img
              v-if="a.albumImg"
              :src="a.albumImg"
              :alt="a.albumName"
              class="aspect-square w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
              @error="hideImg"
            />
            <div v-else class="flex aspect-square w-full items-center justify-center text-muted-foreground">
              <Music2Icon class="size-8" />
            </div>
            <Button
              variant="secondary"
              size="icon-sm"
              class="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
              title="下载整张专辑"
              @click.stop="queueAlbum(a)"
            >
              <DownloadIcon class="size-4" />
            </Button>
          </div>
          <div class="mt-2 truncate text-sm font-medium" :title="a.albumName">{{ a.albumName }}</div>
          <div class="text-xs text-muted-foreground">
            {{ a.albumTime?.slice(0, 4) || '未知年份' }}
            <template v-if="a.dataInfo?.musiccnt"> · {{ a.dataInfo.musiccnt }} 首</template>
          </div>
        </div>
      </div>
    </section>

    <!-- 歌手简介 -->
    <section v-if="describe" class="mt-10">
      <h2 class="mb-2 text-lg font-semibold">歌手简介</h2>
      <div class="relative rounded-lg border p-4">
        <div
          class="prose-sm text-sm leading-6 text-muted-foreground"
          :class="expanded ? '' : 'max-h-40 overflow-hidden'"
          v-html="describe"
        />
        <div
          v-if="!expanded"
          class="pointer-events-none absolute inset-x-0 bottom-10 h-16 bg-gradient-to-t from-background to-transparent"
        />
        <Button variant="ghost" size="sm" class="mt-1 w-full" @click="expanded = !expanded">
          {{ expanded ? '收起' : '展开全文' }}
        </Button>
      </div>
    </section>

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
