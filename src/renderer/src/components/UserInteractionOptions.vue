<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UserInteractionRequest } from '@renderer/types'

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
  <div class="user-interaction-options">
    <div class="options-question">{{ interactionInfo.question }}</div>
    <div class="options-list" :class="{ 'is-scrollable': showScrollableList }">
      <button
        v-for="option in visibleOptions"
        :key="option.value"
        class="option-card"
        @click="handleSelect(option.value, option.label)"
      >
        <span class="option-label">{{ option.label }}</span>
        <span v-if="option.description" class="option-desc">{{ option.description }}</span>
      </button>
    </div>
    <button
      v-if="hasHiddenOptions && !expanded"
      type="button"
      class="expand-button"
      @click="handleExpand"
    >
      {{ expandButtonText }}
    </button>
  </div>
</template>

<style scoped>
.user-interaction-options {
  margin-bottom: 12px;
  padding: 12px 16px;
  background-color: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
}

.options-question {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.options-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.options-list.is-scrollable {
  max-height: 248px;
  overflow-y: auto;
  padding-right: 4px;
}

.option-card {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 12px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
  text-align: left;
}

.option-card:hover {
  border-color: var(--sm-color-border-accent);
  background-color: var(--sm-color-surface-hover);
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.option-desc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  line-height: 1.4;
}

.expand-button {
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background-color: transparent;
  color: var(--sm-color-accent-hover);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.expand-button:hover {
  background-color: var(--sm-color-surface-hover);
}
</style>
