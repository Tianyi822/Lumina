<script setup lang="ts">
import type { ParsedOption } from '@renderer/utils/optionParser'
import styles from './PaperChatOptions.module.css'

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
  <div :class="styles['paper-chat-options']" role="group" aria-label="对话选项">
    <button
      v-for="option in options"
      :key="option.fullText"
      type="button"
      :class="styles['paper-chat-options__button']"
      :disabled="disabled"
      @click="handleSelect(option)"
    >
      <span :class="styles['paper-chat-options__id']">{{ option.id }}</span>
      <span :class="styles['paper-chat-options__label']">{{ option.label }}</span>
    </button>
  </div>
</template>
