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
  border-bottom: none;
}

.file-selector-header__copy {
  min-width: 0;
}

.file-selector-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}
</style>
