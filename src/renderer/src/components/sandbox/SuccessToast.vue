<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

defineProps<{
  visible: boolean
  message: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <Transition name="toast">
    <div v-if="visible" class="success-toast" role="status" aria-live="polite" aria-atomic="true">
      <div class="toast-content">
        <SvgIcon class="toast-icon" name="check" :size="16" />
        <p class="toast-message">{{ message }}</p>
        <button type="button" class="toast-close" aria-label="关闭成功提示" @click="emit('close')">
          <SvgIcon name="close" :size="14" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.success-toast {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1001;
  max-width: 400px;
  background-color: var(--sm-color-surface-3);
  border: 1px solid rgba(127, 176, 138, 0.24);
  border-radius: var(--sm-radius-md);
  padding: 12px 16px;
}

.success-toast .toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.success-toast .toast-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-status-success);
  flex-shrink: 0;
}

.success-toast .toast-message {
  flex: 1;
  color: var(--sm-color-status-success);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.success-toast .toast-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-status-success);
  cursor: pointer;
  padding: 0;
  opacity: 0.7;
  transition:
    opacity var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
  flex-shrink: 0;
}

.success-toast .toast-close:hover {
  background: rgba(127, 176, 138, 0.08);
  border-color: rgba(127, 176, 138, 0.22);
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--sm-transition-medium),
    transform var(--sm-transition-medium);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(var(--sm-motion-distance-md));
}
</style>
