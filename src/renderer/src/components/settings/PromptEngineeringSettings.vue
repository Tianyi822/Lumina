<script setup lang="ts">
import PromptSettings from './PromptSettings.vue'
import type { PromptConfig } from '@renderer/types'

// ==================== Props & Emits ====================
defineProps<{
  modelValue: PromptConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PromptConfig): void
  (e: 'reset-success'): void
}>()

// ==================== Methods ====================
function handleUpdateConfig(value: PromptConfig): void {
  emit('update:modelValue', value)
}

function handleResetSuccess(): void {
  emit('reset-success')
}
</script>

<template>
  <div class="prompt-engineering-settings">
    <PromptSettings
      :model-value="modelValue"
      @update:model-value="handleUpdateConfig"
      @reset-success="handleResetSuccess"
    />
  </div>
</template>

<style scoped>
.prompt-engineering-settings {
  height: 100%;
  overflow-y: auto;
}
</style>
