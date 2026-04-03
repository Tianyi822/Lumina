<script setup lang="ts">
import type { ParsedOption } from '@renderer/utils/optionParser'

defineProps<{
  options: ParsedOption[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', option: ParsedOption): void
}>()

function handleSelect(option: ParsedOption): void {
  emit('select', option)
}
</script>

<template>
  <div class="chat-options" role="group" aria-label="对话选项">
    <button
      v-for="option in options"
      :key="option.fullText"
      type="button"
      class="option-button"
      :disabled="disabled"
      @click="handleSelect(option)"
    >
      <span class="option-id">{{ option.id }}</span>
      <span class="option-label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.chat-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  width: 100%;
  max-width: 100%;
}

.option-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  max-width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.option-button:hover:not(:disabled) {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.option-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.option-id {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--sm-color-accent-12);
  color: var(--sm-color-accent-hover);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.option-label {
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  word-break: break-word;
}
</style>
