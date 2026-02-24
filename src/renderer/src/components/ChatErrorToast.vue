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
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    var(--theme-bg-secondary);
  backdrop-filter: blur(28px) saturate(200%) brightness(1.1);
  -webkit-backdrop-filter: blur(28px) saturate(200%) brightness(1.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--theme-radius);
  padding: 12px 16px;
  box-shadow:
    0 10px 36px rgba(0, 0, 0, 0.2),
    0 3px 10px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 var(--glass-white-1, rgba(255, 255, 255, 0.1));
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
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--theme-danger);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s;
  font-family: var(--theme-font);
  flex-shrink: 0;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
