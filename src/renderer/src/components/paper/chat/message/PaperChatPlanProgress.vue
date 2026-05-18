<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PlanStep } from '@renderer/types'
import styles from './PaperChatPlanProgress.module.css'

const props = defineProps<{
  planExecution?: {
    steps: PlanStep[]
    currentStepIndex: number
    isActive: boolean
  }
}>()

const isExpanded = ref(false)

const hasContent = computed(() => {
  return props.planExecution && props.planExecution.steps.length > 0
})

const completedCount = computed(() => {
  return props.planExecution?.steps.filter((s) => s.status === 'success').length ?? 0
})

const totalCount = computed(() => {
  return props.planExecution?.steps.length ?? 0
})

watch(
  () => props.planExecution?.isActive,
  (active, prev) => {
    if (active && !prev) {
      isExpanded.value = true
    }
  },
  { immediate: true }
)

function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
}

function getStatusIcon(status: PlanStep['status']): string {
  switch (status) {
    case 'success':
      return '✓'
    case 'failed':
      return '✗'
    case 'running':
      return '●'
    case 'skipped':
      return '—'
    default:
      return ''
  }
}

function getStatusClass(status: PlanStep['status']): string {
  return `paper-chat-plan-progress__node--${status}`
}
</script>

<template>
  <div v-if="hasContent" :class="styles['paper-chat-plan-progress']">
    <button
      :class="styles['paper-chat-plan-progress__header']"
      type="button"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div :class="styles['paper-chat-plan-progress__header-left']">
        <span :class="styles['paper-chat-plan-progress__title']">执行计划</span>
        <span :class="styles['paper-chat-plan-progress__badge']">
          {{ completedCount }}/{{ totalCount }} 步骤
        </span>
        <span
          v-if="planExecution?.isActive"
          :class="styles['paper-chat-plan-progress__streaming-indicator']"
        >
          <span :class="styles['paper-chat-plan-progress__pulse-dot']"></span>
          执行中
        </span>
      </div>

      <div :class="styles['paper-chat-plan-progress__header-right']">
        <span class="paper-chat-plan-progress__expand-icon" :class="{ expanded: isExpanded }"
          >▶</span
        >
      </div>
    </button>

    <Transition name="paper-chat-plan-expand">
      <div v-if="isExpanded" :class="styles['paper-chat-plan-progress__content']">
        <div :class="styles['paper-chat-plan-progress__timeline']">
          <div
            v-for="step in planExecution?.steps"
            :key="step.index"
            :class="[
              styles['paper-chat-plan-progress__step'],
              { active: step.status === 'running' }
            ]"
          >
            <div :class="styles['paper-chat-plan-progress__step-rail']">
              <span class="paper-chat-plan-progress__node" :class="getStatusClass(step.status)">{{
                getStatusIcon(step.status)
              }}</span>
            </div>

            <div :class="styles['paper-chat-plan-progress__step-main']">
              <div :class="styles['paper-chat-plan-progress__step-title']">{{ step.title }}</div>
              <div
                v-if="step.status === 'running'"
                :class="styles['paper-chat-plan-progress__step-desc']"
              >
                {{ step.description }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
