<script setup lang="ts">
/**
 * 文件管理模态框头部组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="sm-pane-header file-manager-header">
    <h2>文件管理</h2>
    <button class="sm-icon-button close-btn" @click="emit('close')">
      <SvgIcon name="close" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.file-manager-header {
  flex-shrink: 0;
}

.file-manager-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}
</style>
