<script setup lang="ts">
import { onMounted } from 'vue'

const props = defineProps<{
  show: boolean
  message: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 3秒后自动关闭
onMounted(() => {
  if (props.show) {
    setTimeout(() => emit('close'), 3000)
  }
})
</script>

<template>
  <Transition name="toast">
    <div v-if="show" class="chat-error-toast">
      <div class="toast-content">
        <span class="toast-icon">⚠️</span>
        <p class="toast-message">{{ message }}</p>
        <button class="toast-close" @click="$emit('close')">×</button>
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
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-danger);
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.toast-content {
  display: flex;
  align-items: start;
  gap: 12px;
}

.toast-icon {
  color: var(--theme-danger);
  font-size: 16px;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  color: var(--theme-danger);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--theme-danger);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
  font-family: var(--theme-font);
  flex-shrink: 0;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
