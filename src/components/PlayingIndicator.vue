<script setup lang="ts">
// 播放中均衡器指示：三根跳动柱（动画见 style.css 的 .eq-bar / @keyframes eq-bounce），
// 尺寸随字号（em）缩放，颜色随 currentColor，替代纯文本「♪」标记
const bars = ['0.65em', '1em', '0.8em']
</script>

<template>
  <span class="inline-flex items-end gap-[2px]" aria-hidden="true">
    <i
      v-for="(h, i) in bars"
      :key="i"
      class="eq-bar"
      :style="{ height: h, animationDelay: `${i * 0.18}s` }"
    />
  </span>
</template>
