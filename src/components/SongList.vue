<script setup lang="ts">
import { DownloadIcon, FileTextIcon, ListPlusIcon, Music2Icon, PlayIcon } from '@lucide/vue'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { musicApi } from '@/api/music'
import type { SongRecord } from '@/api/types'
import QualityBadge from '@/components/QualityBadge.vue'
import QualityMenu from '@/components/QualityMenu.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { brTypeLabel, formatDuration, resolveBrType, sortBrTypes } from '@/lib/format'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'

const props = defineProps<{
  songs: SongRecord[]
  loading?: boolean
}>()

const emit = defineEmits<{
  lyrics: [song: SongRecord]
}>()

const app = useAppStore()
const player = usePlayerStore()
const downloadBusy = ref(false)

function artists(song: SongRecord): string {
  return song.artistName?.join(' / ') || '未知歌手'
}

function artistIdOf(song: SongRecord): string | null {
  return song.artistids?.[0] ?? null
}

function topQuality(song: SongRecord): string[] {
  return sortBrTypes(song.brTypes ?? []).slice(0, 3)
}

/** 一键下载到服务器：按设置的偏好音质，无则自动降档/升档/取最高 */
async function quickDownload(song: SongRecord) {
  if (downloadBusy.value) return
  downloadBusy.value = true
  const brType = resolveBrType(app.downloadBrType, song.brTypes ?? [])
  try {
    await musicApi.downloadSong(song, brType || undefined)
    toast.success('已加入服务器下载队列', {
      description: `${song.name}（${brType ? brTypeLabel(brType, app.brTypeList) : '最高音质'}）`,
    })
  } catch (e) {
    toast.error('加入下载队列失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    downloadBusy.value = false
  }
}

/** 立即播放：已在队列则切到该首，否则追加到队尾并播放（不替换队列） */
async function playNow(song: SongRecord) {
  try {
    await player.playNow(song)
  } catch (e) {
    toast.error('播放失败', { description: e instanceof Error ? e.message : String(e) })
  }
}

/** 双击歌曲行播放；双击行内按钮/链接时忽略，避免与单击操作冲突 */
function onRowDblClick(e: MouseEvent, song: SongRecord) {
  if ((e.target as HTMLElement).closest('button, a')) return
  playNow(song)
}

/** 追加到播放队列末尾；若当前没有播放中的歌曲则直接开始播放 */
async function enqueue(song: SongRecord) {
  try {
    await player.addToQueue(song)
    toast.success('已加入播放队列', { description: song.name })
  } catch (e) {
    toast.error('加入播放队列失败', { description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <div>
    <!-- 加载骨架 -->
    <template v-if="loading">
      <div v-for="i in 8" :key="i" class="flex items-center gap-3 px-3 py-2">
        <Skeleton class="size-11 rounded-md" />
        <div class="flex-1 space-y-1.5">
          <Skeleton class="h-3.5 w-1/3" />
          <Skeleton class="h-3 w-1/2" />
        </div>
        <Skeleton class="h-5 w-20 rounded-2xl" />
      </div>
    </template>

    <template v-else>
      <div
        v-for="song in songs"
        :key="`${song.plugName}-${song.id}`"
        class="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
        title="双击播放"
        @dblclick="onRowDblClick($event, song)"
      >
        <Avatar class="size-11 rounded-md">
          <AvatarImage v-if="song.pic" :src="song.pic" :alt="song.name" />
          <AvatarFallback class="rounded-md">
            <Music2Icon class="size-4 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium" :title="song.name">
            {{ song.name }}
            <span
              v-if="player.song && player.song.id === song.id && player.song.plugName === song.plugName"
              class="ml-1 text-xs text-primary"
            >
              ♪ 播放中
            </span>
          </div>
          <div class="truncate text-xs text-muted-foreground" :title="`${artists(song)} · ${song.albumName || ''}`">
            <RouterLink
              v-if="artistIdOf(song)"
              :to="`/artist/${song.plugName}/${artistIdOf(song)}`"
              class="hover:text-foreground hover:underline"
            >
              {{ artists(song) }}</RouterLink>
            <span v-else>{{ artists(song) }}</span>
            <template v-if="song.albumName">
              ·
              <RouterLink
                v-if="song.albumid"
                :to="`/album/${song.plugName}/${song.albumid}`"
                class="hover:text-foreground hover:underline"
              >{{ song.albumName }}</RouterLink>
              <span v-else>{{ song.albumName }}</span>
            </template>
          </div>
        </div>

        <div class="hidden gap-1 md:flex">
          <QualityBadge v-for="bt in topQuality(song)" :key="bt" :br-type="bt" />
        </div>

        <div class="hidden w-12 shrink-0 text-right text-xs text-muted-foreground lg:block">
          {{ formatDuration(song.duration) }}
        </div>

        <div class="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="播放"
            :disabled="player.loading"
            @click="playNow(song)"
          >
            <PlayIcon class="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="加入播放队列" @click="enqueue(song)">
            <ListPlusIcon class="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="歌词" @click="emit('lyrics', song)">
            <FileTextIcon class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="下载到服务器"
            :disabled="downloadBusy"
            @click="quickDownload(song)"
          >
            <DownloadIcon class="size-4" />
          </Button>
          <QualityMenu :song="song" />
        </div>
      </div>
    </template>
  </div>
</template>
