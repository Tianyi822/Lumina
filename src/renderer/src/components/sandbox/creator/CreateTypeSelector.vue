<script setup lang="ts">
import type { SandboxCreateType } from '@renderer/stores/sandbox/types'

defineProps<{
  modelValue: SandboxCreateType
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: SandboxCreateType): void
}>()
</script>

<template>
  <div class="creator-type-selection">
    <label class="type-option" :class="{ active: modelValue === 'compose' }">
      <input
        :checked="modelValue === 'compose'"
        type="radio"
        value="compose"
        @change="emit('update:modelValue', 'compose')"
      />
      <span class="option-label">Docker Compose</span>
    </label>
    <label class="type-option" :class="{ active: modelValue === 'dockerfile' }">
      <input
        :checked="modelValue === 'dockerfile'"
        type="radio"
        value="dockerfile"
        @change="emit('update:modelValue', 'dockerfile')"
      />
      <span class="option-label">Dockerfile</span>
    </label>
    <label class="type-option" :class="{ active: modelValue === 'existing' }">
      <input
        :checked="modelValue === 'existing'"
        type="radio"
        value="existing"
        @change="emit('update:modelValue', 'existing')"
      />
      <span class="option-label">选择已有容器</span>
    </label>
  </div>
</template>

<style scoped>
.creator-type-selection {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.type-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background-color: var(--theme-bg);
  border: 2px solid var(--theme-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.type-option input {
  display: none;
}

.type-option:hover {
  border-color: var(--theme-text-secondary);
}

.type-option.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}
</style>
