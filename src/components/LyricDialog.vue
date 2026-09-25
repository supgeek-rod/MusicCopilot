<script setup lang="ts">
import { LoaderCircleIcon } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getLyric as getFnosLyric } from '@/api/fnos'
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
import { usePlayerStore } from '@/stores/player'

const props = defineProps<{
  open: boolean
  song: SongRecord | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const player = usePlayerStore()
const loading = ref(false)
const error = ref('')
/** 解析后的歌词行：time 为秒（无时间轴的纯文本行为 null） */
const lines = ref<{ time: number | null; text: string }[]>([])
let disposed = false

/** 元数据标签（[ti:]/[ar:]/[offset:] 等）剔除时间标签后残留 "ti:xxx" 形式，识别后整行丢弃 */
const META_LINE_RE = /^(?:ti|ar|al|by|offset|ver|kuwo|ml|hash|encoding|total|length|sign|re):/i
/** 整行仅由 [key:value] 元数据标签构成（酷我头部 [kuwo:127][ver:v1.0][ti:晴天]…） */
const META_TAGS_ONLY_RE = /^(?:\[[^\]:]*:[^\]]*\]\s*)+$/

/** 解析一行歌词：行级时间取 [mm:ss.xx] 标签（酷我逐字行同样以它为准，字标签 <毫秒,毫秒> 数值非绝对时间不可用作行时间，仅在无行标签时回退）；[key:value] 元数据标签剥除，普通方括号内容（酷我的行内翻译）保留 */
function parseLine(raw: string): { time: number | null; text: string } {
  const m = raw.match(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/)
  let time: number | null = null
  if (m) {
    const frac = m[3] ? Number(`0.${m[3]}`) : 0
    time = Number(m[1]) * 60 + Number(m[2]) + frac
  }
  let text: string
  const wordTags = [...raw.matchAll(/<(\d+),\s*-?\d+>/g)]
  if (wordTags.length) {
    if (time === null) time = Number(wordTags[0]![1]!) / 1000
    text = raw.replace(/<\d+,\s*-?\d+>/g, '').trim()
  } else {
    text = raw.replace(/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '').trim()
  }
  // 头部元数据可能与首个歌词行同行（酷我常见），一律剥除 [key:value] 形态标签；无冒号的行内翻译不受影响
  text = text.replace(/\[[^\]:]*:[^\]]*\]/g, '').replace(/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '').trim()
  if (text === '' || META_LINE_RE.test(text) || META_TAGS_ONLY_RE.test(text)) return { time: null, text: '' }
  return { time, text }
}

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.song) return
    loading.value = true
    error.value = ''
    lines.value = []
    try {
      // fnOS 本地曲目走音乐库歌词接口（/lyric/list 取 preferred），在线源走后端 getLyric
      const text =
        props.song.plugName === 'fnos'
          ? await getFnosLyric(props.song.id)
          : await musicApi.getLyric(props.song.plugName, props.song.id)
      if (disposed) return
      const parsed = String(text ?? '')
        .split(/\r?\n/)
        .map(parseLine)
        .filter((l) => l.text !== '')
      lines.value = parsed.length ? parsed : [{ time: null, text: '（无歌词或纯音乐）' }]
    } catch (e) {
      if (disposed) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (!disposed) loading.value = false
    }
  },
)

/** 歌词是否带时间轴（决定是否高亮/跟随） */
const timed = computed(() => lines.value.some((l) => l.time !== null))

/** 当前行：最后一个 time ≤ 进度(+0.3s 前瞻补偿) 的行；无时间轴恒 -1 */
const activeIdx = computed(() => {
  if (!timed.value) return -1
  const t = player.currentTime + 0.3
  let idx = -1
  for (let i = 0; i < lines.value.length; i++) {
    const time = lines.value[i]!.time
    if (time !== null && time <= t) idx = i
  }
  return idx
})

const listRef = ref<HTMLElement | null>(null)

/** 把高亮行滚到视口中部（用 rect 差值，不依赖 offsetParent 链） */
function scrollToActive(idx: number) {
  const root = listRef.value
  if (!root) return
  const el = root.querySelector<HTMLElement>(`[data-lyric-idx="${idx}"]`)
  // reka-ui ScrollArea 的 viewport（兼容 radix 旧前缀）
  const viewport =
    root.closest<HTMLElement>('[data-reka-scroll-area-viewport]') ??
    root.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
  if (!el || !viewport) return
  const vr = viewport.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  const target = viewport.scrollTop + (er.top - vr.top) - viewport.clientHeight / 2 + er.height / 2
  viewport.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}

// 跟随滚动：行切换时跟随；弹窗打开时按当前进度定位一次
watch(activeIdx, (idx) => {
  if (idx >= 0 && props.open) scrollToActive(idx)
})
watch(
  () => props.open,
  (open) => {
    if (open && activeIdx.value >= 0) scrollToActive(activeIdx.value)
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
        <div ref="listRef" class="py-1 text-center">
          <p
            v-for="(line, i) in lines"
            :key="i"
            :data-lyric-idx="i"
            class="py-1 text-sm leading-6 transition-colors"
            :class="i === activeIdx ? 'text-foreground font-medium' : timed ? 'text-muted-foreground' : ''"
          >
            {{ line.text }}
          </p>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
