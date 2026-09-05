<script setup lang="ts">
import { ListMusicIcon, MoonIcon, Music2Icon, SearchIcon, SunIcon } from '@lucide/vue'
import { useDark, useToggle } from '@vueuse/core'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const route = useRoute()
const isDark = useDark()
const toggleDark = useToggle(isDark)

const statusTitle = computed(() => `${app.statusMsg}｜后端：${app.apiBase || '同源'}`)

const navs = [
  { path: '/search', label: '搜索', icon: SearchIcon },
  { path: '/downloads', label: '下载任务', icon: ListMusicIcon },
]
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
    <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
      <div class="flex items-center gap-2">
        <div class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Music2Icon class="size-4.5" />
        </div>
        <div class="leading-tight">
          <div class="text-sm font-semibold">MusicCopilot</div>
          <div
            class="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex"
            :title="statusTitle"
          >
            <span
              class="inline-block size-1.5 rounded-full"
              :class="app.connected ? 'bg-emerald-500' : 'bg-destructive animate-pulse'"
            />
            {{ app.connected ? '已连接' : app.statusMsg }}
          </div>
        </div>
      </div>

      <nav class="ml-auto flex items-center gap-1">
        <Button
          v-for="nav in navs"
          :key="nav.path"
          :variant="route.path === nav.path ? 'secondary' : 'ghost'"
          size="sm"
          as-child
        >
          <RouterLink :to="nav.path">
            <component :is="nav.icon" class="size-4" />
            {{ nav.label }}
          </RouterLink>
        </Button>

        <Button variant="ghost" size="icon-sm" :title="isDark ? '切换浅色' : '切换深色'" @click="toggleDark()">
          <SunIcon v-if="isDark" class="size-4" />
          <MoonIcon v-else class="size-4" />
        </Button>
      </nav>
    </div>
  </header>
</template>
