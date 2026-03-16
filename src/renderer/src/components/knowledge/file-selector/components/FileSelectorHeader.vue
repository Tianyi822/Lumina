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
  <div class="file-selector-header">
    <h2>添加文件</h2>
    <button class="close-btn" @click="emit('close')">
      <SvgIcon name="close" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.file-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--theme-border);
}

.file-selector-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text);
}
</style>
