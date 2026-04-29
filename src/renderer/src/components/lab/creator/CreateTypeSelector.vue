<script setup lang="ts">
import type { LabCreateType } from '@renderer/stores/lab/types'

defineProps<{
  modelValue: LabCreateType
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: LabCreateType): void
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
  border-bottom: 1px solid var(--sm-color-border-default);
  background-color: var(--sm-color-surface-1);
}

.type-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background-color: var(--sm-color-bg-app);
  border: 2px solid var(--sm-color-border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.type-option input {
  display: none;
}

.type-option:hover {
  border-color: var(--sm-color-text-secondary);
}

.type-option.active {
  border-color: var(--sm-color-border-selected);
  background-color: var(--sm-color-surface-selected);
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}
</style>
