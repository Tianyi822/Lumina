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
    <div v-if="visible" class="success-toast">
      <div class="toast-content">
        <span class="toast-icon">✓</span>
        <p class="toast-message">{{ message }}</p>
        <button class="toast-close" @click="emit('close')">×</button>
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
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-success);
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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
  background: none;
  border: none;
  font-size: 20px;
  color: var(--theme-success);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
  font-family: var(--theme-font);
  flex-shrink: 0;
}

.success-toast .toast-close:hover {
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
