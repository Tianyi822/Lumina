<script setup lang="ts">
defineProps<{
  error: string | null
}>()

defineEmits<{
  (e: 'dismiss'): void
}>()
</script>

<template>
  <div v-if="error" class="error-banner">
    <div class="error-content">
      <span class="error-icon">⚠️</span>
      <span class="error-message">{{ error }}</span>
      <button class="error-dismiss" @click="$emit('dismiss')">×</button>
    </div>
  </div>
</template>

<style scoped>
.error-banner {
  background: rgba(239, 68, 68, 0.06);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
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
  font-size: 16px;
  flex-shrink: 0;
}

.error-message {
  flex: 1;
  color: var(--theme-danger);
  font-size: 13px;
  line-height: 1.5;
}

.error-dismiss {
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
}

.error-dismiss:hover {
  opacity: 1;
}
</style>
