<script setup lang="ts">
/**
 * 文件选择器头部组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="sm-pane-header file-selector-header">
    <div class="file-selector-header__copy">
      <p class="file-selector-header__eyebrow">文档挂载</p>
      <h2>添加文件</h2>
    </div>
    <button class="sm-icon-button close-btn" @click="emit('close')">
      <SvgIcon name="close" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.file-selector-header {
  flex-shrink: 0;
}

.file-selector-header__copy {
  min-width: 0;
}

.file-selector-header__eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.file-selector-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}
</style>
