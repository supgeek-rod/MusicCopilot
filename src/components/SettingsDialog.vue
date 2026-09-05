<script setup lang="ts">
import { SettingsIcon } from '@lucide/vue'
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { brBit, brTypeLabel } from '@/lib/format'
import { FALLBACK_QUALITY_OPTIONS } from '@/lib/settings'
import { useAppStore } from '@/stores/app'

const app = useAppStore()

/** 音质选项：优先后端枚举表（按展示标签去重），不可用时用内置兜底档位；码率从高到低 */
const qualityOptions = computed<{ value: string; label: string }[]>(() => {
  if (!app.brTypeList.length) {
    return FALLBACK_QUALITY_OPTIONS.map((q) => ({ value: q.id, label: q.label }))
  }
  const seen = new Set<string>()
  const out: { value: string; label: string }[] = []
  for (const i of app.brTypeList) {
    if (!i.id) continue
    const label = brTypeLabel(i.id, app.brTypeList)
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ value: i.id, label })
  }
  return out.sort((a, b) => brBit(b.value) - brBit(a.value))
})

function onQualityChange(value: unknown) {
  // 'auto' 仅作为 Select 的占位值（SelectItem 不允许空串），存储时空串表示自动
  const v = typeof value === 'string' ? value : ''
  const brType = v === 'auto' ? '' : v
  app.setDownloadBrType(brType)
  toast.success('设置已保存', {
    description: `下载音质：${brType ? brTypeLabel(brType, app.brTypeList) : '自动（最高音质）'}`,
  })
}
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button variant="ghost" size="icon-sm" title="设置">
        <SettingsIcon class="size-4" />
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>
          歌曲行「下载」按钮使用的音质；歌曲没有该音质时自动就近降档，再不行就近升档。
        </DialogDescription>
      </DialogHeader>

      <label class="flex items-center justify-between gap-3 text-sm">
        <span class="shrink-0 text-muted-foreground">下载音质</span>
        <Select
          :model-value="app.downloadBrType"
          @update:model-value="onQualityChange"
        >
          <SelectTrigger class="w-44">
            <SelectValue placeholder="自动（最高音质）" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动（最高音质）</SelectItem>
            <SelectItem v-for="q in qualityOptions" :key="q.value" :value="q.value">
              {{ q.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
    </DialogContent>
  </Dialog>
</template>
