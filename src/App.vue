<script setup lang="ts">
import { LoaderCircleIcon } from '@lucide/vue'
import { onMounted, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import PlayerBar from '@/components/PlayerBar.vue'
import { Toaster } from '@/components/ui/sonner'
import { startTaskToasts } from '@/lib/taskToaster'
import { useAppStore } from '@/stores/app'

const app = useAppStore()

onMounted(() => {
  app.init()
})

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
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <RouterView />
    </main>
    <PlayerBar />
  </div>

  <Toaster position="top-center" rich-colors close-button />
</template>
