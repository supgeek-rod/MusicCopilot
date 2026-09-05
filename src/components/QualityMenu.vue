<script setup lang="ts">
import { DownloadIcon, EllipsisIcon, HardDriveDownloadIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { musicApi } from '@/api/music'
import type { SongRecord } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { brTypeLabel, sortBrTypes } from '@/lib/format'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ song: SongRecord }>()

const app = useAppStore()
const busy = ref(false)

const qualities = computed(() =>
  sortBrTypes(props.song.brTypes ?? []).map((bt) => ({
    brType: bt,
    label: brTypeLabel(bt, app.brTypeList),
  })),
)

function fileBaseName(): string {
  const artists = props.song.artistName?.join(',') || '未知歌手'
  return `${artists} - ${props.song.name}`
}

/** 创建服务端下载任务（brType 省略时后端自动选最高音质） */
async function queue(brType?: string) {
  if (busy.value) return
  busy.value = true
  try {
    await musicApi.downloadSong(props.song, brType)
    toast.success('已加入服务器下载队列', { description: `${props.song.name}${brType ? `（${brTypeLabel(brType, app.brTypeList)}）` : '（最高音质）'}` })
  } catch (e) {
    toast.error('加入下载队列失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}

/** 浏览器直链下载 */
async function direct(brType: string) {
  if (busy.value) return
  busy.value = true
  try {
    const info = await musicApi.getDownloadUrl(props.song.plugName, props.song.id, brType, props.song.brTypes ?? [])
    const a = document.createElement('a')
    a.href = info.url
    a.download = `${fileBaseName()}.${info.format || 'mp3'}`
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.info('已打开下载链接', {
      description: brTypeLabel(info.brType, app.brTypeList),
    })
  } catch (e) {
    toast.error('获取下载链接失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" title="更多操作" :disabled="busy || !qualities.length">
        <EllipsisIcon class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-52">
      <DropdownMenuLabel>下载到服务器</DropdownMenuLabel>
      <DropdownMenuItem @select="queue()">
        <HardDriveDownloadIcon class="size-4" />
        最高音质
      </DropdownMenuItem>
      <DropdownMenuItem v-for="q in qualities" :key="`q-${q.brType}`" @select="queue(q.brType)">
        <HardDriveDownloadIcon class="size-4" />
        {{ q.label }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>浏览器直链下载</DropdownMenuLabel>
      <DropdownMenuItem v-for="q in qualities" :key="`d-${q.brType}`" @select="direct(q.brType)">
        <DownloadIcon class="size-4" />
        {{ q.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
