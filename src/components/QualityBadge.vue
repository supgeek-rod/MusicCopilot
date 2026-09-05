<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { BadgeVariants } from '@/components/ui/badge'
import { brTypeLabel, qualityTier } from '@/lib/format'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ brType: string }>()

const app = useAppStore()

const label = computed(() => brTypeLabel(props.brType, app.brTypeList))

const tierClass = computed(() => {
  switch (qualityTier(props.brType)) {
    case 'lossless':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400'
    case 'high':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
    default:
      return 'text-muted-foreground'
  }
})
</script>

<template>
  <Badge variant="outline" :class="tierClass" :title="brType">{{ label }}</Badge>
</template>
