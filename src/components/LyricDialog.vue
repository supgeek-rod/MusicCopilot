<script setup lang="ts">
import { LoaderCircleIcon } from '@lucide/vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { musicApi } from '@/api/music'
import type { SongRecord } from '@/api/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

const props = defineProps<{
  open: boolean
  song: SongRecord | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const loading = ref(false)
const error = ref('')
const lines = ref<string[]>([])
let disposed = false

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.song) return
    loading.value = true
    error.value = ''
    lines.value = []
    try {
      const text = await musicApi.getLyric(props.song.plugName, props.song.id)
      if (disposed) return
      const parsed = String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.replace(/\[[^\]]*\]/g, '').trim())
        .filter(Boolean)
      lines.value = parsed.length ? parsed : ['（无歌词或纯音乐）']
    } catch (e) {
      if (disposed) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (!disposed) loading.value = false
    }
  },
)

onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="truncate">{{ song?.name || '歌词' }}</DialogTitle>
        <DialogDescription class="truncate">
          {{ song?.artistName?.join(' / ') }}<template v-if="song?.albumName"> · {{ song.albumName }}</template>
        </DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="flex items-center justify-center py-12">
        <LoaderCircleIcon class="size-5 animate-spin text-muted-foreground" />
      </div>
      <div v-else-if="error" class="py-8 text-center text-sm text-destructive">{{ error }}</div>
      <ScrollArea v-else class="max-h-[60vh] pr-3">
        <div class="py-1 text-center">
          <p v-for="(line, i) in lines" :key="i" class="py-1 text-sm leading-6">{{ line }}</p>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
