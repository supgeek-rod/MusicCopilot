<script setup lang="ts">
import { CopyrightIcon, PlugIcon, SlidersHorizontalIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { brBit, brTypeLabel } from '@/lib/format'
import { FALLBACK_QUALITY_OPTIONS } from '@/lib/settings'
import { useAppStore } from '@/stores/app'

const app = useAppStore()

// 构建时由 vite define 注入（取自 package.json version）
const appVersion = __APP_VERSION__

// 设置页左侧导航分区
const sections = [
  { id: 'general', label: '通用', icon: SlidersHorizontalIcon },
  { id: 'connection', label: '后端连接', icon: PlugIcon },
  { id: 'about', label: '版权信息', icon: CopyrightIcon },
] as const

type SectionId = (typeof sections)[number]['id']

const active = ref<SectionId>('general')

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

// ---- 后端连接 ----
const baseUrl = ref('')
const username = ref('')
const password = ref('')
const saving = ref(false)
const hasOverride = computed(() => !!app.localOverride)

// 默认值提示：部署配置（config.json）中的值——proxyTarget 为服务端转发层实际使用的后端地址
const defaultBaseUrl = computed(
  () => app.fileConfig?.proxyTarget?.trim() || app.fileConfig?.baseUrl?.trim() || '',
)
const defaultUsername = computed(() => app.fileConfig?.username ?? '')
const defaultPassword = computed(() => app.fileConfig?.password ?? '')

/** 保存连接配置：仅写入本设备浏览器存储并立即重连生效；留空的字段跟随默认值 */
async function saveConnection() {
  const url = baseUrl.value.trim()
  if (url && !/^https?:\/\//i.test(url)) {
    toast.error('后端地址无效', { description: '需以 http:// 或 https:// 开头，留空表示跟随默认值' })
    return
  }
  saving.value = true
  try {
    const loggedIn = await app.applyConnection({
      baseUrl: url,
      username: username.value.trim(),
      password: password.value,
    })
    if (loggedIn) {
      toast.success('连接设置已保存', { description: '已在本设备生效' })
    } else {
      toast.warning('配置已保存，但重连失败', {
        description: `请检查后端地址与账号密码（${app.statusMsg}）`,
      })
    }
  } catch (e) {
    toast.error('保存失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    saving.value = false
  }
}

/** 清除本设备覆盖配置，恢复跟随部署的 config.json */
async function resetConnection() {
  await app.resetConnection()
  toast.success('已恢复跟随 config.json 文件配置')
}
</script>

<template>
  <div class="flex flex-col gap-6 sm:flex-row sm:gap-10">
    <!-- 左侧分区导航 -->
    <nav class="flex shrink-0 gap-1 sm:w-40 sm:flex-col" aria-label="设置分区">
      <button
        v-for="s in sections"
        :key="s.id"
        type="button"
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
        :class="active === s.id ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'"
        @click="active = s.id"
      >
        <component :is="s.icon" class="size-4" />
        {{ s.label }}
      </button>
    </nav>

    <!-- 右侧内容 -->
    <div class="min-w-0 flex-1">
      <!-- 通用 -->
      <section v-if="active === 'general'" class="max-w-xl">
        <h2 class="text-lg font-semibold">通用</h2>
        <p class="mt-1 text-sm text-muted-foreground">播放与下载偏好。</p>
        <Separator class="my-4" />
        <label class="flex items-center justify-between gap-3 text-sm">
          <span class="shrink-0 text-muted-foreground">下载音质</span>
          <Select :model-value="app.downloadBrType" @update:model-value="onQualityChange">
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
      </section>

      <!-- 后端连接 -->
      <section v-else-if="active === 'connection'" class="max-w-xl space-y-3">
        <h2 class="text-lg font-semibold">后端连接</h2>
        <p class="text-sm text-muted-foreground">本设备的后端连接覆盖配置。</p>
        <Separator class="my-4" />
        <div>
          <h3 class="text-sm font-medium">自定义 MC_API</h3>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Docker / Vite 启动时，后端地址由 .env 的 MC_API_BASE_URL 提供，经 nginx / Vite
            反向代理转发，规避 CORS 问题。若在此手动指定，该设备浏览器将直连后端，可能存在 CORS
            限制；全部留空则跟随默认值，账号用于 token 失效后静默重登。
          </p>
        </div>

        <label class="block space-y-1 text-sm">
          <span class="text-muted-foreground">MC_API_BASE_URL</span>
          <Input
            v-model="baseUrl"
            :placeholder="defaultBaseUrl ? `默认值：${defaultBaseUrl}` : '默认值：（同源反代）'"
            autocomplete="url"
            spellcheck="false"
          />
        </label>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">MC_API_USERNAME</span>
            <Input
              v-model="username"
              :placeholder="defaultUsername ? `默认值：${defaultUsername}` : '默认值：（未配置）'"
              autocomplete="username"
              spellcheck="false"
            />
          </label>
          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">MC_API_PASSWORD</span>
            <Input
              v-model="password"
              type="password"
              :placeholder="defaultPassword ? `默认值：${defaultPassword}` : '默认值：（未配置）'"
              autocomplete="new-password"
            />
          </label>
        </div>

        <div class="flex items-center gap-2">
          <Button size="sm" :disabled="saving" @click="saveConnection">
            {{ saving ? '保存中…' : '保存并重连' }}
          </Button>
          <Button variant="ghost" size="sm" :disabled="saving" @click="resetConnection">
            恢复跟随文件
          </Button>
          <span v-if="hasOverride" class="text-xs text-muted-foreground">当前使用本设备覆盖配置</span>
        </div>
      </section>

      <!-- 版权信息 -->
      <section v-else-if="active === 'about'" class="max-w-xl">
        <h2 class="text-lg font-semibold">版权信息</h2>
        <p class="mt-1 text-sm text-muted-foreground">项目开源信息与授权说明。</p>
        <Separator class="my-4" />

        <div class="space-y-4 text-sm">
          <div class="flex items-center gap-2">
            <span class="font-medium">MusicCopilot</span>
            <span class="rounded-full border px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              v{{ appVersion }}
            </span>
          </div>

          <dl class="space-y-2">
            <div class="flex items-center gap-2">
              <dt class="w-20 shrink-0 text-muted-foreground">源代码</dt>
              <dd>
                <a
                  class="text-primary hover:underline"
                  href="https://github.com/supgeek-rod/MusicCopilot"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/supgeek-rod/MusicCopilot
                </a>
              </dd>
            </div>
            <div class="flex items-center gap-2">
              <dt class="w-20 shrink-0 text-muted-foreground">文档</dt>
              <dd>
                <a
                  class="text-primary hover:underline"
                  href="https://supgeek-rod.github.io/MusicCopilot/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  supgeek-rod.github.io/MusicCopilot
                </a>
              </dd>
            </div>
            <div class="flex items-center gap-2">
              <dt class="w-20 shrink-0 text-muted-foreground">授权</dt>
              <dd>
                <a
                  class="text-primary hover:underline"
                  href="https://github.com/supgeek-rod/MusicCopilot/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MIT License
                </a>
              </dd>
            </div>
          </dl>

          <p class="text-xs leading-relaxed text-muted-foreground">
            Copyright © 2026 supgeek-rod。本项目基于 MIT 授权发布：任何人可免费使用、复制、修改与分发，
            需保留上述版权与许可声明；软件按「现状」提供，不含任何形式的担保。
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
