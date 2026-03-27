<script setup lang="ts">
defineProps<{
  error: string | null
}>()

defineEmits<{
  (e: 'dismiss'): void
}>()
</script>

<template>
  <div v-if="error" class="error-banner" role="alert" aria-live="assertive" aria-atomic="true">
    <div class="error-content">
      <span class="error-icon">⚠️</span>
      <span class="error-message">{{ error }}</span>
      <button type="button" class="error-dismiss" @click="$emit('dismiss')">×</button>
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
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  font-size: 18px;
  color: var(--theme-danger);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.6;
  transition:
    opacity var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
  font-family: var(--theme-font);
}

.error-dismiss:hover {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.22);
  opacity: 1;
}
</style>
