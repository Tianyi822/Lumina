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
  gap: 10px;
  width: 100%;
  max-width: 100%;
}

.option-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  max-width: 100%;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, var(--theme-border));
  border-radius: 999px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 8%, transparent) 0%,
      var(--theme-bg-secondary) 100%
    ),
    var(--theme-bg-secondary);
  color: var(--theme-text);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background-color 0.16s ease;
}

.option-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 45%, var(--theme-border));
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
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
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
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
