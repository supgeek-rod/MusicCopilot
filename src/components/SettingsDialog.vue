<script setup lang="ts">
import { SettingsIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
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
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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

// ---- 后端连接 ----
const open = ref(false)
const baseUrl = ref('')
const username = ref('')
const password = ref('')
const saving = ref(false)
const hasOverride = computed(() => !!app.localOverride)

// 默认值提示：部署配置（config.json）中的硬编码值
const defaultBaseUrl = computed(() => app.fileConfig?.baseUrl?.trim() ?? '')
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
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button variant="ghost" size="icon-sm" title="设置">
        <SettingsIcon class="size-4" />
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>下载音质与后端连接配置。</DialogDescription>
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

      <Separator />

      <div class="space-y-3">
        <div>
          <h3 class="text-sm font-medium">自定义 MC_API_BASE_URL</h3>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Docker / Vite 启动时，后端地址由 .env 的 MC_API_BASE_URL 提供，经 nginx / Vite
            反向代理转发，规避 CORS 问题。若在此手动指定，该设备浏览器将直连后端，可能存在 CORS
            限制；全部留空则跟随默认值，账号用于 token 失效后静默重登。
          </p>
        </div>

        <label class="block space-y-1 text-sm">
          <span class="text-muted-foreground">后端地址</span>
          <Input
            v-model="baseUrl"
            :placeholder="defaultBaseUrl ? `默认值：${defaultBaseUrl}` : '默认值：（空，同源）'"
            autocomplete="url"
            spellcheck="false"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">用户名</span>
            <Input
              v-model="username"
              :placeholder="defaultUsername ? `默认值：${defaultUsername}` : '默认值：（未配置）'"
              autocomplete="username"
              spellcheck="false"
            />
          </label>
          <label class="block space-y-1 text-sm">
            <span class="text-muted-foreground">密码</span>
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
          <Button v-if="hasOverride" variant="ghost" size="sm" @click="resetConnection">
            恢复跟随文件
          </Button>
          <span v-if="hasOverride" class="text-xs text-muted-foreground">当前使用本设备覆盖配置</span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
