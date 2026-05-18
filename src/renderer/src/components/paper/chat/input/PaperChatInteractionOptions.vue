<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UserInteractionRequest } from '@renderer/types'
import styles from './PaperChatInteractionOptions.module.css'

const props = defineProps<{
  interactionInfo: UserInteractionRequest
}>()

const emit = defineEmits<{
  (e: 'select', value: string, label: string): void
}>()

function handleSelect(value: string, label: string): void {
  emit('select', value, label)
}

const expanded = ref(false)

const initialVisibleCount = computed(() => {
  const requestedCount = props.interactionInfo.initialVisibleCount
  if (typeof requestedCount === 'number' && requestedCount > 0) {
    return requestedCount
  }
  return props.interactionInfo.options.length
})

const hasHiddenOptions = computed(() => {
  return props.interactionInfo.options.length > initialVisibleCount.value
})

const visibleOptions = computed(() => {
  if (!hasHiddenOptions.value || expanded.value) {
    return props.interactionInfo.options
  }
  return props.interactionInfo.options.slice(0, initialVisibleCount.value)
})

const hiddenOptionCount = computed(() => {
  return Math.max(props.interactionInfo.options.length - visibleOptions.value.length, 0)
})

const showScrollableList = computed(() => {
  return expanded.value && props.interactionInfo.options.length > initialVisibleCount.value
})

const expandButtonText = computed(() => {
  return `查看更多选项（剩余 ${hiddenOptionCount.value} 个）`
})

function handleExpand(): void {
  expanded.value = true
}

watch(
  () => props.interactionInfo,
  () => {
    expanded.value = false
  },
  { deep: true }
)
</script>

<template>
  <div :class="styles['paper-chat-interaction-options']">
    <div :class="styles['paper-chat-interaction-options__question']">
      {{ interactionInfo.question }}
    </div>
    <div
      :class="[
        styles['paper-chat-interaction-options__list'],
        { 'is-scrollable': showScrollableList }
      ]"
    >
      <button
        v-for="option in visibleOptions"
        :key="option.value"
        :class="styles['paper-chat-interaction-options__card']"
        @click="handleSelect(option.value, option.label)"
      >
        <span :class="styles['paper-chat-interaction-options__label']">{{ option.label }}</span>
        <span v-if="option.description" :class="styles['paper-chat-interaction-options__desc']">{{
          option.description
        }}</span>
      </button>
    </div>
    <button
      v-if="hasHiddenOptions && !expanded"
      type="button"
      :class="styles['paper-chat-interaction-options__expand-button']"
      @click="handleExpand"
    >
      {{ expandButtonText }}
    </button>
  </div>
</template>
