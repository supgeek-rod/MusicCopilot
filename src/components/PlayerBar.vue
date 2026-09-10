<script setup lang="ts">
import {
  Music2Icon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import QueuePanel from '@/components/QueuePanel.vue'
import { Slider } from '@/components/ui/slider'
import { formatSeconds } from '@/lib/format'
import { bindAudioEl, togglePlayback } from '@/lib/playback'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()
const audioRef = ref<HTMLAudioElement | null>(null)

// 音频元素挂载/卸载时同步注册，供全局快捷键（空格播放/暂停）复用
watch(
  audioRef,
  (el) => bindAudioEl(el),
  { immediate: true, flush: 'post' },
)

const pct = computed(() =>
  player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0,
)

watch(
  () => player.playSeq,
  () => {
    const audio = audioRef.value
    if (!audio || !player.url) return
    audio.src = player.url
    audio.volume = player.volume
    audio.play().catch(() => {
      toast.error('播放失败', { description: '链接可能已失效，请重新试听' })
    })
  },
  // playSeq 首次变化时播放条才挂载，需等 DOM 更新后再操作 audio
  { flush: 'post' },
)

function onPlay() {
  player.isPlaying = true
}
function onPause() {
  player.isPlaying = false
}
function onTimeupdate() {
  const audio = audioRef.value
  if (audio) player.currentTime = audio.currentTime
}
function onDurationchange() {
  const audio = audioRef.value
  if (audio && Number.isFinite(audio.duration)) player.duration = audio.duration
}
function onEnded() {
  player.isPlaying = false
  // 播放结束自动切下一首（队列尾则停止）
  if (player.hasNext) player.next()
}
function onError() {
  if (player.url) {
    toast.error('播放失败', { description: '音频链接可能已失效，请重新试听' })
    player.isPlaying = false
  }
}

function togglePlay() {
  togglePlayback(player)
}

function onSeek(value: number[] | undefined) {
  const audio = audioRef.value
  const v = value?.[0]
  if (audio && player.duration > 0 && v !== undefined) {
    audio.currentTime = (v / 100) * player.duration
  }
}

function onVolume(value: number[] | undefined) {
  const v = value?.[0]
  if (v === undefined) return
  player.volume = v / 100
  if (audioRef.value) audioRef.value.volume = player.volume
}

function close() {
  const audio = audioRef.value
  audio?.pause()
  if (audio) audio.removeAttribute('src')
  player.stop()
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-full"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-full"
  >
    <div
      v-if="player.song"
      class="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur"
    >
      <audio
        ref="audioRef"
        @play="onPlay"
        @pause="onPause"
        @timeupdate="onTimeupdate"
        @durationchange="onDurationchange"
        @ended="onEnded"
        @error="onError"
      />
      <div class="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
        <Avatar class="size-10 shrink-0 rounded-md">
          <AvatarImage v-if="player.song.pic" :src="player.song.pic" />
          <AvatarFallback class="rounded-md">
            <Music2Icon class="size-4 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        <div class="hidden w-40 min-w-0 shrink-0 sm:block">
          <div class="truncate text-sm font-medium" :title="player.song?.name">{{ player.song?.name }}</div>
          <div class="truncate text-xs text-muted-foreground">
            {{ player.song?.artistName?.join(' / ') || '未知歌手' }}
            <span v-if="player.queuePosition" class="ml-1 tabular-nums">{{ player.queuePosition }}</span>
          </div>
        </div>

        <Button
          v-if="player.queue.length > 1"
          variant="ghost"
          size="icon-sm"
          title="上一首"
          :disabled="!player.hasPrev"
          @click="player.prev()"
        >
          <SkipBackIcon class="size-4" />
        </Button>
        <Button variant="ghost" size="icon" title="播放 / 暂停" @click="togglePlay">
          <PauseIcon v-if="player.isPlaying" class="size-5" />
          <PlayIcon v-else class="size-5" />
        </Button>
        <Button
          v-if="player.queue.length > 1"
          variant="ghost"
          size="icon-sm"
          title="下一首"
          :disabled="!player.hasNext"
          @click="player.next()"
        >
          <SkipForwardIcon class="size-4" />
        </Button>

        <span class="hidden w-10 text-right text-xs tabular-nums text-muted-foreground sm:block">
          {{ formatSeconds(player.currentTime) }}
        </span>
        <Slider
          :model-value="[pct]"
          :max="100"
          :step="0.1"
          class="flex-1 cursor-pointer"
          @update:model-value="onSeek"
        />
        <span class="hidden w-10 text-xs tabular-nums text-muted-foreground sm:block">
          {{ formatSeconds(player.duration) }}
        </span>

        <div class="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            :title="player.volume === 0 ? '取消静音' : '静音'"
            @click="onVolume([player.volume === 0 ? 70 : 0])"
          >
            <VolumeXIcon v-if="player.volume === 0" class="size-4" />
            <Volume2Icon v-else class="size-4" />
          </Button>
          <Slider
            :model-value="[player.volume * 100]"
            :max="100"
            :step="1"
            class="w-20 cursor-pointer"
            @update:model-value="onVolume"
          />
        </div>

        <QueuePanel />

        <Button variant="ghost" size="icon-sm" title="关闭播放器" @click="close">
          <XIcon class="size-4" />
        </Button>
      </div>
    </div>
  </Transition>
</template>
