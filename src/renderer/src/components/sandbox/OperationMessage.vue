<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

interface Props {
  type: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const icon = computed(() => {
  switch (props.type) {
    case 'error':
      return 'close'
    case 'warning':
      return 'warning'
    case 'success':
      return 'check'
    case 'info':
      return 'info'
    default:
      return 'info'
  }
})

const typeClass = computed(() => `message-${props.type}`)
const liveRole = computed(() => (props.type === 'error' ? 'alert' : 'status'))
const liveMode = computed(() => (props.type === 'error' ? 'assertive' : 'polite'))
</script>

<template>
  <Transition name="message">
    <div
      v-if="visible"
      class="operation-message"
      :class="typeClass"
      :role="liveRole"
      :aria-live="liveMode"
      aria-atomic="true"
    >
      <div class="message-icon">
        <SvgIcon :name="icon" :size="14" />
      </div>
      <div class="message-content">
        <div class="message-title">{{ title }}</div>
        <div class="message-text">{{ message }}</div>
      </div>
      <button type="button" class="message-close" aria-label="关闭操作提示" @click="emit('close')">
        <SvgIcon name="close" :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
@import '@renderer/styles/operation-message-colors.css';

.operation-message {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  min-width: 320px;
  max-width: 480px;
  background-color: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  z-index: 9999;
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.message-text {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.message-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
  flex-shrink: 0;
}

.message-close:hover {
  background-color: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-default);
  color: var(--sm-color-text-primary);
}

/* 过渡动画 */
.message-enter-active,
.message-leave-active {
  transition:
    opacity var(--sm-transition-medium),
    transform var(--sm-transition-medium);
}

.message-enter-from {
  opacity: 0;
  transform: translateX(var(--sm-motion-distance-md));
}

.message-leave-to {
  opacity: 0;
  transform: translateX(var(--sm-motion-distance-md));
}
</style>
