<script setup lang="ts">
import { SHORTCUTS } from '@/lib/shortcuts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>键盘快捷键</DialogTitle>
        <DialogDescription>随时可用，输入框内不触发；Mac 上 Ctrl 即 ⌘。</DialogDescription>
      </DialogHeader>

      <ul class="space-y-1.5">
        <li
          v-for="s in SHORTCUTS"
          :key="s.action"
          class="flex items-center justify-between gap-4 text-sm"
        >
          <span class="text-muted-foreground">{{ s.action }}</span>
          <span class="flex shrink-0 items-center gap-1">
            <kbd
              v-for="k in s.keys"
              :key="k"
              class="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
            >
              {{ k }}
            </kbd>
          </span>
        </li>
      </ul>
    </DialogContent>
  </Dialog>
</template>
