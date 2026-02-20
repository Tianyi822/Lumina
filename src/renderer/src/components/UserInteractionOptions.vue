<script setup lang="ts">
import type { UserInteractionRequest } from '@renderer/types'

defineProps<{
  interactionInfo: UserInteractionRequest
}>()

const emit = defineEmits<{
  (e: 'select', value: string, label: string): void
}>()

function handleSelect(value: string, label: string): void {
  emit('select', value, label)
}
</script>

<template>
  <div class="user-interaction-options">
    <div class="options-question">{{ interactionInfo.question }}</div>
    <div class="options-list">
      <button
        v-for="option in interactionInfo.options"
        :key="option.value"
        class="option-card"
        @click="handleSelect(option.value, option.label)"
      >
        <span class="option-label">{{ option.label }}</span>
        <span v-if="option.description" class="option-desc">{{ option.description }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.user-interaction-options {
  margin-bottom: 12px;
  padding: 12px 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
}

.options-question {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--theme-text);
}

.options-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.option-card {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 12px;
  background-color: var(--theme-bg);
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.option-card:hover {
  border-color: var(--theme-accent);
  background-color: var(--theme-bg-hover);
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
}

.option-desc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--theme-text-secondary);
  line-height: 1.4;
}
</style>
