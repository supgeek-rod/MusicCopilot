<script setup lang="ts">
import { FileTextIcon, Music2Icon, PlayIcon } from '@lucide/vue'
import type { SongRecord } from '@/api/types'
import QualityBadge from '@/components/QualityBadge.vue'
import QualityMenu from '@/components/QualityMenu.vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, sortBrTypes } from '@/lib/format'
import { usePlayerStore } from '@/stores/player'

const props = defineProps<{
  songs: SongRecord[]
  loading?: boolean
}>()

const emit = defineEmits<{
  play: [song: SongRecord]
  lyrics: [song: SongRecord]
}>()

const player = usePlayerStore()

function artists(song: SongRecord): string {
  return song.artistName?.join(' / ') || '未知歌手'
}

function artistIdOf(song: SongRecord): string | null {
  return song.artistids?.[0] ?? null
}

function topQuality(song: SongRecord): string[] {
  return sortBrTypes(song.brTypes ?? []).slice(0, 3)
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
            title="试听"
            :disabled="player.loading"
            @click="emit('play', song)"
          >
            <PlayIcon class="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="歌词" @click="emit('lyrics', song)">
            <FileTextIcon class="size-4" />
          </Button>
          <QualityMenu :song="song" />
        </div>
      </div>
    </template>
  </div>
</template>
