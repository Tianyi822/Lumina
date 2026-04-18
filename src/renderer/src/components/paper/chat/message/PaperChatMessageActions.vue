<script setup lang="ts">
defineProps<{
  hasFeedbackSlot?: boolean
}>()
</script>

<template>
  <div class="message-actions">
    <div v-if="hasFeedbackSlot" class="message-feedback">
      <slot name="feedback"></slot>
    </div>
  </div>
</template>

<style scoped>
.message-actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-shrink: 0;
}

.message-feedback {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  color: inherit;
  font-size: 11px;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  box-sizing: border-box;
}
</style>
