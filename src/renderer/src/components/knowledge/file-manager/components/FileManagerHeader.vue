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
    <div class="file-manager-header__copy">
      <p class="file-manager-header__eyebrow">文件资源池</p>
      <h2>文件管理</h2>
    </div>
    <button class="sm-icon-button close-btn" @click="emit('close')">
      <SvgIcon name="close" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.file-manager-header {
  flex-shrink: 0;
}

.file-manager-header__copy {
  min-width: 0;
}

.file-manager-header__eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.file-manager-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}
</style>
