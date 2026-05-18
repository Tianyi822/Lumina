<script setup lang="ts">
import type { LabCreateType } from '@renderer/stores/lab/types'
import { useNotification } from '@renderer/composables/useNotification'
import styles from './CreateTypeSelector.module.css'

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
  <div :class="styles['creator-type-selection']" role="radiogroup" aria-label="实验室创建方式">
    <label
      :class="[
        styles['type-option'],
        {
          [styles['active']]: modelValue === 'compose',
          [styles['disabled']]: dockerReady === false
        }
      ]"
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
      <span :class="styles['option-label']">Docker Compose</span>
    </label>
    <label
      :class="[
        styles['type-option'],
        {
          [styles['active']]: modelValue === 'dockerfile',
          [styles['disabled']]: dockerReady === false
        }
      ]"
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
      <span :class="styles['option-label']">Dockerfile</span>
    </label>
    <label
      :class="[
        styles['type-option'],
        {
          [styles['active']]: modelValue === 'existing',
          [styles['disabled']]: dockerReady === false
        }
      ]"
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
      <span :class="styles['option-label']">选择已有容器</span>
    </label>
    <label
      :class="[styles['type-option'], { [styles['active']]: modelValue === 'ssh' }]"
      role="radio"
      :aria-checked="modelValue === 'ssh'"
    >
      <input :checked="modelValue === 'ssh'" type="radio" value="ssh" @change="onSelect('ssh')" />
      <span :class="styles['option-label']">SSH 远程服务器</span>
    </label>
  </div>
</template>
