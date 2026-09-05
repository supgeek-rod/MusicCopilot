<script setup lang="ts">
import { ListMusicIcon, ListXIcon, Music2Icon, XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDuration } from '@/lib/format'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()

async function playAt(index: number) {
  try {
    await player.jump(index)
  } catch (e) {
    toast.error('播放失败', { description: e instanceof Error ? e.message : String(e) })
  }
}

async function remove(index: number) {
  try {
    await player.removeFromQueue(index)
  } catch (e) {
    toast.error('移除失败', { description: e instanceof Error ? e.message : String(e) })
  }
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon-sm" title="播放队列">
        <ListMusicIcon class="size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" class="w-80 gap-0 p-0">
      <div class="flex items-center justify-between border-b px-3 py-2">
        <span class="text-sm font-medium">
          播放队列
          <span v-if="player.queue.length" class="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
            {{ player.queue.length }} 首
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="清空队列并停止播放"
          :disabled="!player.queue.length"
          @click="player.stop()"
        >
          <ListXIcon class="size-4" />
        </Button>
      </div>

      <ScrollArea class="max-h-80">
        <div v-if="!player.queue.length" class="px-3 py-10 text-center text-sm text-muted-foreground">
          队列为空
        </div>
        <div
          v-for="(song, i) in player.queue"
          :key="`${song.plugName}-${song.id}-${i}`"
          class="flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/60"
          :class="i === player.queueIndex ? 'text-primary' : ''"
          @click="playAt(i)"
        >
          <span class="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
            <template v-if="i === player.queueIndex">♪</template>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <Avatar class="size-8 shrink-0 rounded-md">
            <AvatarImage v-if="song.pic" :src="song.pic" :alt="song.name" />
            <AvatarFallback class="rounded-md">
              <Music2Icon class="size-3.5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm" :title="song.name">{{ song.name }}</div>
            <div class="truncate text-xs text-muted-foreground" :title="song.artistName?.join(' / ')">
              {{ song.artistName?.join(' / ') || '未知歌手' }}
            </div>
          </div>
          <span class="hidden w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
            {{ formatDuration(song.duration) }}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            title="移出播放队列"
            class="text-muted-foreground hover:text-foreground"
            @click.stop="remove(i)"
          >
            <XIcon class="size-4" />
          </Button>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>
