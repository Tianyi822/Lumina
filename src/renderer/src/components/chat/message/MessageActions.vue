<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

defineProps<{
  canExport: boolean
  isExporting?: boolean
  hasFeedbackSlot?: boolean
}>()

const emit = defineEmits<{
  (e: 'export'): void
}>()
</script>

<template>
  <div class="message-actions">
    <button
      v-if="canExport"
      class="export-button"
      :disabled="isExporting"
      :title="isExporting ? '正在导出中' : '导出当前回复'"
      @click="emit('export')"
    >
      <SvgIcon name="export" :size="12" />
      <span>{{ isExporting ? '导出中' : '导出' }}</span>
    </button>

    <div v-if="hasFeedbackSlot" class="message-feedback">
      <slot name="feedback"></slot>
    </div>
  </div>
</template>

<style scoped>
.message-actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-shrink: 0;
}

.export-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background: var(--sm-color-surface-1);
  color: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.export-button svg {
  width: 12px;
  height: 12px;
}

.export-button:hover:not(:disabled) {
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
  background: rgba(142, 149, 217, 0.08);
}

.export-button:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.message-feedback {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  color: inherit;
  font-size: 11px;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  box-sizing: border-box;
}
</style>
