<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PlanningStatusIndicator from './PlanningStatusIndicator.vue'
import type { PaperChatPlanState } from '@renderer/stores/paperChatStreamStore'
import type { PlanStep } from '@renderer/types'

const props = defineProps<{
  planState?: PaperChatPlanState | null
}>()

const isExpanded = ref(false)

const shouldShow = computed(() => {
  return !!props.planState && props.planState.status !== 'idle'
})

const steps = computed(() => props.planState?.steps ?? [])
const totalCount = computed(() => steps.value.length)
const successCount = computed(() => steps.value.filter((step) => step.status === 'success').length)
const failedCount = computed(() => steps.value.filter((step) => step.status === 'failed').length)
const cancelledCount = computed(
  () => steps.value.filter((step) => step.status === 'cancelled').length
)
const runningStep = computed(() => steps.value.find((step) => step.status === 'running') ?? null)
const hasSteps = computed(() => totalCount.value > 0)

const statusLabel = computed(() => {
  switch (props.planState?.status) {
    case 'planning':
      return '规划中'
    case 'planned':
      return '已生成计划'
    case 'running':
      return '执行中'
    case 'failed':
      return '执行失败'
    case 'completed':
      return '执行完成'
    case 'cancelled':
      return '已取消'
    default:
      return ''
  }
})

const summaryText = computed(() => {
  if (!hasSteps.value) {
    return props.planState?.error || '正在准备任务计划'
  }

  const fragments = [`${successCount.value}/${totalCount.value} 已完成`]
  if (runningStep.value) {
    fragments.push(`当前：${runningStep.value.title}`)
  }
  if (failedCount.value > 0) {
    fragments.push(`${failedCount.value} 个失败`)
  }
  if (cancelledCount.value > 0) {
    fragments.push(`${cancelledCount.value} 个取消`)
  }
  return fragments.join(' · ')
})

watch(
  () => props.planState?.turnId,
  () => {
    isExpanded.value = false
  }
)

function toggleExpanded(): void {
  if (!hasSteps.value) {
    return
  }
  isExpanded.value = !isExpanded.value
}

function isRetryingStep(step: PlanStep): boolean {
  return step.status === 'running' && (step.attempt ?? 1) > 1
}

function getStepStatusLabel(step: PlanStep): string {
  if (isRetryingStep(step)) {
    return 'retrying'
  }

  const status = step.status
  switch (status) {
    case 'pending':
      return 'pending'
    case 'running':
      return 'running'
    case 'success':
      return 'success'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'skipped'
    case 'cancelled':
      return 'cancelled'
  }
}

function getStepDetail(step: PlanStep): string {
  const detail = step.error || step.summary || step.description
  const retryCount = Math.max((step.attempt ?? 1) - 1, 0)

  if (step.status === 'failed' && retryCount > 0) {
    return detail ? `已重试 ${retryCount} 次：${detail}` : `已重试 ${retryCount} 次`
  }

  if (isRetryingStep(step)) {
    return step.maxAttempts
      ? `第 ${step.attempt}/${step.maxAttempts} 次尝试`
      : `第 ${step.attempt} 次尝试`
  }

  return detail
}
</script>

<template>
  <section v-if="shouldShow" class="paper-chat-plan-dock" :class="`is-${planState?.status}`">
    <div v-if="!hasSteps && planState?.status === 'planning'" class="paper-chat-plan-dock__waiting">
      <span class="paper-chat-plan-dock__dot" aria-hidden="true"></span>
      <PlanningStatusIndicator />
    </div>

    <div v-else-if="!hasSteps" class="paper-chat-plan-dock__empty-status">
      <span class="paper-chat-plan-dock__status-label">{{ statusLabel }}</span>
      <span class="paper-chat-plan-dock__summary">{{ summaryText }}</span>
    </div>

    <template v-else>
      <button
        type="button"
        class="paper-chat-plan-dock__header"
        :aria-expanded="isExpanded"
        @click="toggleExpanded"
      >
        <div class="paper-chat-plan-dock__header-main">
          <span class="paper-chat-plan-dock__status-label">{{ statusLabel }}</span>
          <span class="paper-chat-plan-dock__summary">{{ summaryText }}</span>
        </div>
        <span class="paper-chat-plan-dock__chevron" :class="{ 'is-expanded': isExpanded }">▶</span>
      </button>

      <Transition name="paper-chat-plan-dock-expand">
        <div v-if="isExpanded" class="paper-chat-plan-dock__body">
          <ol class="paper-chat-plan-dock__list">
            <li
              v-for="step in steps"
              :key="step.index"
              class="paper-chat-plan-dock__item"
              :class="`is-${step.status}`"
            >
              <span class="paper-chat-plan-dock__item-state">
                {{ getStepStatusLabel(step) }}
              </span>
              <div class="paper-chat-plan-dock__item-main">
                <span class="paper-chat-plan-dock__item-title">{{ step.title }}</span>
                <span v-if="getStepDetail(step)" class="paper-chat-plan-dock__item-detail">
                  {{ getStepDetail(step) }}
                </span>
              </div>
            </li>
          </ol>
        </div>
      </Transition>
    </template>
  </section>
</template>

<style scoped>
.paper-chat-plan-dock {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
}

.paper-chat-plan-dock__waiting,
.paper-chat-plan-dock__empty-status,
.paper-chat-plan-dock__header {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  padding: 9px 11px;
}

.paper-chat-plan-dock__header {
  width: 100%;
  justify-content: space-between;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--sm-transition-fast);
}

.paper-chat-plan-dock__header:hover {
  background: var(--sm-color-surface-hover);
}

.paper-chat-plan-dock__header-main,
.paper-chat-plan-dock__empty-status {
  min-width: 0;
}

.paper-chat-plan-dock__header-main {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
}

.paper-chat-plan-dock__status-label {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid var(--sm-color-accent-22);
  border-radius: 999px;
  background: var(--sm-color-accent-08);
  color: var(--sm-color-accent-hover);
  font-size: 11px;
  font-weight: 600;
}

.paper-chat-plan-dock.is-failed .paper-chat-plan-dock__status-label {
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.1);
  color: var(--sm-color-status-danger);
}

.paper-chat-plan-dock.is-cancelled .paper-chat-plan-dock__status-label {
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-chat-plan-dock.is-completed .paper-chat-plan-dock__status-label {
  border-color: rgba(34, 197, 94, 0.28);
  background: rgba(34, 197, 94, 0.1);
  color: var(--sm-color-status-success);
}

.paper-chat-plan-dock__summary {
  min-width: 0;
  overflow: hidden;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-chat-plan-dock__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--sm-color-accent);
  animation: paperChatPlanDockPulse 1.4s ease-in-out infinite;
}

.paper-chat-plan-dock__chevron {
  flex-shrink: 0;
  color: var(--sm-color-text-tertiary);
  font-size: 10px;
  transition: transform var(--sm-transition-fast);
}

.paper-chat-plan-dock__chevron.is-expanded {
  transform: rotate(90deg);
}

.paper-chat-plan-dock__body {
  max-height: 220px;
  overflow-y: auto;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-plan-dock__list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
}

.paper-chat-plan-dock__item {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: var(--sm-space-2);
  padding: 8px;
  border-radius: var(--sm-radius-sm);
}

.paper-chat-plan-dock__item.is-running {
  background: var(--sm-color-accent-08);
}

.paper-chat-plan-dock__item.is-failed {
  background: rgba(239, 68, 68, 0.08);
}

.paper-chat-plan-dock__item-state {
  align-self: start;
  color: var(--sm-color-text-tertiary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.paper-chat-plan-dock__item.is-running .paper-chat-plan-dock__item-state {
  color: var(--sm-color-accent-hover);
}

.paper-chat-plan-dock__item.is-success .paper-chat-plan-dock__item-state {
  color: var(--sm-color-status-success);
}

.paper-chat-plan-dock__item.is-failed .paper-chat-plan-dock__item-state {
  color: var(--sm-color-status-danger);
}

.paper-chat-plan-dock__item-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.paper-chat-plan-dock__item-title {
  color: var(--sm-color-text-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

.paper-chat-plan-dock__item-detail {
  color: var(--sm-color-text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}

.paper-chat-plan-dock-expand-enter-active {
  animation: paperChatPlanDockExpandIn 150ms ease;
}

.paper-chat-plan-dock-expand-leave-active {
  animation: paperChatPlanDockExpandOut 130ms ease;
}

@keyframes paperChatPlanDockPulse {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 0.9;
  }
}

@keyframes paperChatPlanDockExpandIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes paperChatPlanDockExpandOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.paper-chat-plan-dock__body::-webkit-scrollbar {
  width: 6px;
}

.paper-chat-plan-dock__body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--sm-color-border-strong);
}
</style>
