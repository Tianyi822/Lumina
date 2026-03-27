<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

defineProps<{
  error: string | null
}>()

defineEmits<{
  (e: 'dismiss'): void
}>()
</script>

<template>
  <div class="error-banner" role="alert" aria-live="assertive" aria-atomic="true">
    <div class="error-content">
      <SvgIcon class="error-icon" name="warning" :size="16" />
      <span class="error-message">{{ error }}</span>
      <button
        type="button"
        class="error-dismiss"
        aria-label="关闭错误提示"
        @click="$emit('dismiss')"
      >
        <SvgIcon name="close" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-banner {
  background: rgba(199, 120, 120, 0.08);
  border-bottom: 1px solid rgba(199, 120, 120, 0.22);
  padding: 10px 16px;
  flex-shrink: 0;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
}

.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-status-danger);
  flex-shrink: 0;
}

.error-message {
  flex: 1;
  color: var(--sm-color-status-danger);
  font-size: 13px;
  line-height: 1.5;
}

.error-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-status-danger);
  cursor: pointer;
  padding: 0;
  opacity: 0.6;
  transition:
    opacity var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.error-dismiss:hover {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.22);
  opacity: 1;
}
</style>
