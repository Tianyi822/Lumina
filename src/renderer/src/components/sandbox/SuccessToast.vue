<script setup lang="ts">
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
        <span class="toast-icon">✓</span>
        <p class="toast-message">{{ message }}</p>
        <button type="button" class="toast-close" @click="emit('close')">×</button>
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
  color: var(--theme-success);
  font-size: 16px;
  flex-shrink: 0;
}

.success-toast .toast-message {
  flex: 1;
  color: var(--theme-success);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.success-toast .toast-close {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  font-size: 20px;
  color: var(--theme-success);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.7;
  transition:
    opacity var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
  font-family: var(--theme-font);
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
