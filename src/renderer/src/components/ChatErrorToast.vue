<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const props = defineProps<{
  show: boolean
  message: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

let closeTimer: ReturnType<typeof setTimeout> | null = null

function clearCloseTimer(): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

watch(
  () => props.show,
  (visible) => {
    clearCloseTimer()

    if (visible) {
      closeTimer = setTimeout(() => emit('close'), 3000)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearCloseTimer()
})
</script>

<template>
  <Transition name="toast">
    <div v-if="show" class="chat-error-toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-content">
        <SvgIcon class="toast-icon" name="warning" :size="16" />
        <p class="toast-message">{{ message }}</p>
        <button type="button" class="toast-close" aria-label="关闭错误提示" @click="$emit('close')">
          <SvgIcon name="close" :size="14" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.chat-error-toast {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  max-width: 400px;
  background: var(--sm-color-surface-3);
  border: 1px solid rgba(199, 120, 120, 0.24);
  border-radius: var(--sm-radius-md);
  padding: 12px 16px;
}

.toast-content {
  display: flex;
  align-items: start;
  gap: 12px;
}

.toast-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-status-danger);
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  color: var(--sm-color-status-danger);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.toast-close {
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
  flex-shrink: 0;
}

.toast-close:hover {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.2);
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
