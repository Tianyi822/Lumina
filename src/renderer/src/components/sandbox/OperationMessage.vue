<script setup lang="ts">
import { computed } from 'vue'

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
      return '✕'
    case 'warning':
      return '⚠'
    case 'success':
      return '✓'
    case 'info':
      return 'ℹ'
    default:
      return 'ℹ'
  }
})

const typeClass = computed(() => `message-${props.type}`)
</script>

<template>
  <Transition name="message">
    <div v-if="visible" class="operation-message" :class="typeClass">
      <div class="message-icon">{{ icon }}</div>
      <div class="message-content">
        <div class="message-title">{{ title }}</div>
        <div class="message-text">{{ message }}</div>
      </div>
      <button class="message-close" @click="emit('close')">×</button>
    </div>
  </Transition>
</template>

<style scoped>
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
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 9999;
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: bold;
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
  color: var(--theme-text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.message-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--theme-text-secondary);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.message-close:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
}

/* 错误样式 */
.message-error {
  border-color: var(--theme-danger);
  background-color: rgba(248, 81, 73, 0.05);
}

.message-error .message-icon {
  background-color: var(--theme-danger);
  color: white;
}

.message-error .message-title {
  color: var(--theme-danger);
}

/* 警告样式 */
.message-warning {
  border-color: var(--theme-warning);
  background-color: rgba(210, 153, 34, 0.05);
}

.message-warning .message-icon {
  background-color: var(--theme-warning);
  color: var(--theme-bg);
}

.message-warning .message-title {
  color: var(--theme-warning);
}

/* 成功样式 */
.message-success {
  border-color: var(--theme-success);
  background-color: rgba(63, 185, 80, 0.05);
}

.message-success .message-icon {
  background-color: var(--theme-success);
  color: white;
}

.message-success .message-title {
  color: var(--theme-success);
}

/* 信息样式 */
.message-info {
  border-color: var(--theme-info);
  background-color: rgba(88, 166, 255, 0.05);
}

.message-info .message-icon {
  background-color: var(--theme-info);
  color: white;
}

.message-info .message-title {
  color: var(--theme-info);
}

/* 过渡动画 */
.message-enter-active,
.message-leave-active {
  transition: all 0.3s ease;
}

.message-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.message-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
