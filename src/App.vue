<script setup lang="ts">
import { LoaderCircleIcon } from '@lucide/vue'
import { onMounted, onBeforeUnmount, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { Toaster } from '@/components/ui/sonner'
import { installKeyboardShortcuts } from '@/lib/playback'
import { persistVolume } from '@/lib/playQueue'
import { startTaskToasts } from '@/lib/taskToaster'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'

const app = useAppStore()
const player = usePlayerStore()

onMounted(() => {
  app.init()
})

// 全局快捷键：空格播放/暂停、`/` 聚焦搜索、Ctrl+←/→ 切歌、Ctrl+↑/↓ 音量
let uninstallShortcuts: (() => void) | null = null
onBeforeUnmount(() => uninstallShortcuts?.())
watch(
  () => app.ready,
  (ready) => {
    if (ready && !uninstallShortcuts) uninstallShortcuts = installKeyboardShortcuts(player)
  },
  { immediate: true },
)

// 音量变更（滑杆/静音/快捷键）持久化，刷新后恢复
watch(
  () => player.volume,
  (v) => persistVolume(v),
)

// 登录成功后启动全局下载完成 toast 通知（幂等）
watch(
  () => app.ready && app.loggedIn,
  (ok) => {
    if (ok) startTaskToasts()
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="!app.ready" class="flex min-h-screen flex-col items-center justify-center gap-3">
    <LoaderCircleIcon class="size-6 animate-spin text-muted-foreground" />
    <p class="text-sm text-muted-foreground">{{ app.statusMsg }}</p>
    <p class="text-xs text-muted-foreground/70">可通过 .env / config.json 配置后端地址与账号</p>
  </div>

  <div v-else class="flex min-h-screen flex-col">
    <AppHeader />
    <div
      v-if="!app.connected"
      class="bg-destructive/10 px-4 py-1.5 text-center text-xs text-destructive"
    >
      {{ app.statusMsg }}：请检查后端服务与 .env / config.json 的 baseUrl 配置
    </div>
    <!-- 播放条（64px 高）可见时预留底部空间，避免遮挡页尾内容（如分页按钮） -->
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 pt-6" :class="player.song ? 'pb-24' : 'pb-6'">
      <RouterView />
    </main>
    <PlayerBar />
  </div>

  <!-- toast 固定右上角，文字右对齐 -->
  <Toaster
    position="top-right"
    rich-colors
    close-button
    :toast-options="{
      classes: {
        toast: 'rounded-2xl [&_[data-title]]:text-right [&_[data-description]]:text-right',
      },
    }"
  />
</template>
