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
  <div class="creator-type-selection" role="radiogroup" aria-label="实验室创建方式">
    <label
      class="type-option"
      :class="{ active: modelValue === 'compose' }"
      role="radio"
      :aria-checked="modelValue === 'compose'"
    >
      <input
        :checked="modelValue === 'compose'"
        type="radio"
        value="compose"
        @change="emit('update:modelValue', 'compose')"
      />
      <span class="option-check" aria-hidden="true"></span>
      <span class="option-label">Docker Compose</span>
    </label>
    <label
      class="type-option"
      :class="{ active: modelValue === 'dockerfile' }"
      role="radio"
      :aria-checked="modelValue === 'dockerfile'"
    >
      <input
        :checked="modelValue === 'dockerfile'"
        type="radio"
        value="dockerfile"
        @change="emit('update:modelValue', 'dockerfile')"
      />
      <span class="option-check" aria-hidden="true"></span>
      <span class="option-label">Dockerfile</span>
    </label>
    <label
      class="type-option"
      :class="{ active: modelValue === 'existing' }"
      role="radio"
      :aria-checked="modelValue === 'existing'"
    >
      <input
        :checked="modelValue === 'existing'"
        type="radio"
        value="existing"
        @change="emit('update:modelValue', 'existing')"
      />
      <span class="option-check" aria-hidden="true"></span>
      <span class="option-label">选择已有容器</span>
    </label>
    <label
      class="type-option"
      :class="{ active: modelValue === 'ssh' }"
      role="radio"
      :aria-checked="modelValue === 'ssh'"
    >
      <input
        :checked="modelValue === 'ssh'"
        type="radio"
        value="ssh"
        @change="emit('update:modelValue', 'ssh')"
      />
      <span class="option-check" aria-hidden="true"></span>
      <span class="option-label">SSH 远程服务器</span>
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
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    box-shadow var(--sm-transition-fast);
}

.type-option input {
  display: none;
}

.type-option:hover {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-05);
}

.type-option.active {
  border-color: var(--sm-color-border-accent);
  background:
    linear-gradient(180deg, var(--sm-color-accent-12), var(--sm-color-accent-06)),
    var(--sm-color-surface-selected);
  color: var(--sm-color-text-selected);
  box-shadow: inset 0 0 0 1px var(--sm-color-accent-18);
}

.option-check {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background: var(--sm-color-surface-1);
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    box-shadow var(--sm-transition-fast);
}

.option-check::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: transparent;
  transition: background-color var(--sm-transition-fast);
}

.type-option.active .option-check {
  border-color: var(--sm-color-accent);
  background: var(--sm-color-accent-12);
  box-shadow: 0 0 0 3px var(--sm-color-accent-08);
}

.type-option.active .option-check::after {
  background: var(--sm-color-accent-active);
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: currentColor;
  text-align: center;
}
</style>
