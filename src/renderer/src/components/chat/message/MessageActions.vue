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
  gap: 8px;
  flex-shrink: 0;
}

.export-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  color: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.export-button svg {
  width: 12px;
  height: 12px;
}

.export-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  color: inherit;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
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
  border-radius: 4px;
  box-sizing: border-box;
}
</style>
