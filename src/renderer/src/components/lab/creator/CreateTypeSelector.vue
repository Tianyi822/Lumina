<script setup lang="ts">
import type { LabCreateType } from '@renderer/stores/lab/types'
import { useNotification } from '@renderer/composables/useNotification'

const props = defineProps<{
  modelValue: LabCreateType
  dockerReady?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: LabCreateType): void
}>()

const notify = useNotification()

function onSelect(value: LabCreateType): void {
  const dockerRequired = value !== 'ssh'
  if (dockerRequired && props.dockerReady === false) {
    notify.warning(
      'Docker 未就绪',
      '本地 Docker 运行时不可用，无法选择此创建方式。请先启动 Docker Desktop 后重新检测，或选择「SSH 远程服务器」方式。',
      { source: 'lab' }
    )
    return
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="creator-type-selection" role="radiogroup" aria-label="实验室创建方式">
    <label
      class="type-option"
      :class="{
        active: modelValue === 'compose',
        disabled: dockerReady === false
      }"
      :title="dockerReady === false ? 'Docker 未就绪' : ''"
      role="radio"
      :aria-checked="modelValue === 'compose'"
    >
      <input
        :checked="modelValue === 'compose'"
        :disabled="dockerReady === false"
        type="radio"
        value="compose"
        @change="onSelect('compose')"
      />
      <span class="option-label">Docker Compose</span>
    </label>
    <label
      class="type-option"
      :class="{
        active: modelValue === 'dockerfile',
        disabled: dockerReady === false
      }"
      :title="dockerReady === false ? 'Docker 未就绪' : ''"
      role="radio"
      :aria-checked="modelValue === 'dockerfile'"
    >
      <input
        :checked="modelValue === 'dockerfile'"
        :disabled="dockerReady === false"
        type="radio"
        value="dockerfile"
        @change="onSelect('dockerfile')"
      />
      <span class="option-label">Dockerfile</span>
    </label>
    <label
      class="type-option"
      :class="{
        active: modelValue === 'existing',
        disabled: dockerReady === false
      }"
      :title="dockerReady === false ? 'Docker 未就绪' : ''"
      role="radio"
      :aria-checked="modelValue === 'existing'"
    >
      <input
        :checked="modelValue === 'existing'"
        :disabled="dockerReady === false"
        type="radio"
        value="existing"
        @change="onSelect('existing')"
      />
      <span class="option-label">选择已有容器</span>
    </label>
    <label
      class="type-option"
      :class="{ active: modelValue === 'ssh' }"
      role="radio"
      :aria-checked="modelValue === 'ssh'"
    >
      <input :checked="modelValue === 'ssh'" type="radio" value="ssh" @change="onSelect('ssh')" />
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

.type-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: var(--sm-color-border-subtle);
  background-color: var(--sm-color-surface-1);
  color: var(--sm-color-text-tertiary);
}

.type-option.disabled:hover {
  border-color: var(--sm-color-border-subtle);
  background-color: var(--sm-color-surface-1);
}

.option-label {
  font-size: 13px;
  font-weight: 500;
  color: currentColor;
  text-align: center;
}
</style>
