<script setup lang="ts">
import { DownloadIcon, Music2Icon, PlayIcon } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { musicApi } from '@/api/music'
import type { AlbumInfo, SongRecord } from '@/api/types'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { albumSongToRecord } from '@/lib/adapter'
import { brTypeLabel, parseBrType, sortBrTypes } from '@/lib/format'
import { useSanitizedHtml } from '@/lib/sanitize'
import { usePlayerStore } from '@/stores/player'

const route = useRoute()
const player = usePlayerStore()

const plug = computed(() => String(route.params.plug))
const albumId = computed(() => String(route.params.id))

const info = ref<AlbumInfo | null>(null)
const songs = ref<SongRecord[]>([])
const loading = ref(false)
const error = ref('')
const expanded = ref(false)

const describe = useSanitizedHtml(() => info.value?.albumDescribe)

const confirm = reactive<{
  open: boolean
  title: string
  desc: string
  action: (() => Promise<void>) | null
}>({ open: false, title: '', desc: '', action: null })

/** 从专辑内所有曲目的音质枚举里汇总出可选码率（高到低去重） */
const qualityOptions = computed(() => {
  const all = new Set<string>()
  for (const s of songs.value) for (const b of s.brTypes ?? []) all.add(b)
  const seen = new Set<number>()
  return sortBrTypes([...all])
    .map((bt) => ({ brType: bt, bit: parseBrType(bt).bit, label: brTypeLabel(bt) }))
    .filter((o) => (o.bit ? !seen.has(o.bit) && seen.add(o.bit) : true))
})

function trackOf(s: SongRecord): number {
  const t = Number((s.dataInfo as Record<string, unknown> | undefined)?.track)
  return Number.isFinite(t) ? t : 9999
}

watch([plug, albumId], load, { immediate: true })

async function load() {
  info.value = null
  songs.value = []
  error.value = ''
  loading.value = true
  try {
    const data = await musicApi.albumInfoById(plug.value, albumId.value)
    info.value = data
    songs.value = (data.musics ?? [])
      .map(albumSongToRecord)
      .sort((a, b) => trackOf(a) - trackOf(b))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
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

function queueAlbum(bit?: number) {
  if (!info.value) return
  askConfirm(
    '下载整张专辑',
    `将把「${info.value.albumName}」的全部 ${songs.value.length} 首歌曲加入服务器下载队列（${bit ? `${bit}K` : '默认音质'}）。`,
    async () => {
      try {
        const res = await musicApi.downloadAlbum(
          {
            albumName: info.value!.albumName,
            albumid: String(info.value!.albumId),
            artistName: info.value!.albumArtist ?? null,
            artistid: info.value!.albumArtistId ?? null,
            pic: info.value!.albumImg ?? null,
            plugName: plug.value,
            total: songs.value.length,
            dataInfo: info.value!.dataInfo,
          },
          bit,
        )
        const count = Array.isArray(res) ? res.length : songs.value.length
        toast.success('专辑已加入下载队列', { description: `${info.value!.albumName} · ${count} 首` })
      } catch (e) {
        toast.error('加入下载队列失败', { description: e instanceof Error ? e.message : String(e) })
      }
    },
  )
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex gap-6">
      <div class="size-44 shrink-0 animate-pulse rounded-lg bg-muted sm:size-52" />
      <div class="flex-1 space-y-3">
        <div class="h-7 w-64 animate-pulse rounded bg-muted" />
        <div class="h-4 w-40 animate-pulse rounded bg-muted" />
        <div class="h-9 w-52 animate-pulse rounded bg-muted" />
      </div>
    </div>

    <div v-else-if="error" class="py-16 text-center">
      <p class="text-sm text-destructive">{{ error }}</p>
      <Button variant="outline" size="sm" class="mt-3" @click="load">重试</Button>
    </div>

    <template v-else-if="info">
      <!-- 专辑头部 -->
      <div class="flex flex-col gap-6 sm:flex-row">
        <div class="size-44 shrink-0 overflow-hidden rounded-lg bg-muted shadow-lg sm:size-52">
          <img
            v-if="info.albumImg"
            :src="info.albumImg"
            :alt="info.albumName"
            class="size-full object-cover"
            @error="hideImg"
          />
          <div v-else class="flex size-full items-center justify-center text-muted-foreground">
            <Music2Icon class="size-12" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="shrink-0">专辑</Badge>
          </div>
          <h1 class="mt-2 truncate text-2xl font-semibold" :title="info.albumName">
            {{ info.albumName }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <template v-if="info.albumArtist">
              <RouterLink
                v-if="info.albumArtistId"
                :to="`/artist/${plug}/${info.albumArtistId}`"
                class="font-medium text-foreground hover:underline"
              >{{ info.albumArtist }}</RouterLink>
              <span v-else class="font-medium text-foreground">{{ info.albumArtist }}</span>
            </template>
            <span v-if="info.albumTime">· {{ info.albumTime.slice(0, 10) }}</span>
            <span v-if="info.dataInfo?.company">· {{ info.dataInfo.company }}</span>
            <span v-if="songs.length">· {{ songs.length }} 首</span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <Button size="sm" :disabled="!songs.length" @click="playAll">
              <PlayIcon class="size-4" />
              播放整张
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="sm" :disabled="!songs.length">
                  <DownloadIcon class="size-4" />
                  下载整张
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-44">
                <DropdownMenuLabel>选择音质</DropdownMenuLabel>
                <DropdownMenuItem @select="queueAlbum()">
                  默认音质
                </DropdownMenuItem>
                <DropdownMenuItem v-for="q in qualityOptions" :key="q.brType" @select="queueAlbum(q.bit)">
                  {{ q.label }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span v-if="player.song && songs.some((s) => s.id === player.song?.id)" class="self-center text-xs text-primary">
              ♪ 正在播放本专辑
            </span>
          </div>
        </div>
      </div>

      <!-- 曲目列表 -->
      <section class="mt-8">
        <div class="rounded-lg border py-1">
          <SongList :songs="songs" :loading="false" />
          <div v-if="!songs.length" class="py-12 text-center text-sm text-muted-foreground">
            暂无曲目
          </div>
        </div>
      </section>

      <!-- 专辑简介 -->
      <section v-if="describe" class="mt-10">
        <h2 class="mb-2 text-lg font-semibold">专辑简介</h2>
        <div class="relative rounded-lg border p-4">
          <div
            class="text-sm leading-6 text-muted-foreground"
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
    </template>

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
