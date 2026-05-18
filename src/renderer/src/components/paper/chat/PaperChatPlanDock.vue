<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PlanningStatusIndicator from './PlanningStatusIndicator.vue'
import type { PaperChatPlanState, PlanStepIteration } from '@renderer/stores/paperChatStreamStore'
import type { PlanStep } from '@renderer/types'
import styles from './PaperChatPlanDock.module.css'

const FADE_DELAY = 5000
const FADE_DURATION = 300

const props = defineProps<{
  planState?: PaperChatPlanState | null
}>()

const isExpanded = ref(false)
const fadeState = ref<'visible' | 'fading' | 'hidden'>('visible')
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let fadeEndTimer: ReturnType<typeof setTimeout> | null = null

const shouldShow = computed(() => {
  return !!props.planState && props.planState.status !== 'idle' && fadeState.value !== 'hidden'
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

function clearFadeTimers(): void {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  if (fadeEndTimer) {
    clearTimeout(fadeEndTimer)
    fadeEndTimer = null
  }
}

function startFadeOut(): void {
  clearFadeTimers()
  fadeTimer = setTimeout(() => {
    fadeState.value = 'fading'
    fadeEndTimer = setTimeout(() => {
      fadeState.value = 'hidden'
    }, FADE_DURATION)
  }, FADE_DELAY)
}

// 新轮次开始时重置状态
watch(
  () => props.planState?.turnId,
  () => {
    isExpanded.value = false
    fadeState.value = 'visible'
    clearFadeTimers()
  }
)

// 状态变为终态时启动淡出计时器
watch(
  () => props.planState?.status,
  (newStatus) => {
    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
      startFadeOut()
    } else {
      clearFadeTimers()
      fadeState.value = 'visible'
    }
  }
)

onBeforeUnmount(() => {
  clearFadeTimers()
})

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
    return '重试中'
  }

  const status = step.status
  switch (status) {
    case 'pending':
      return '等待中'
    case 'running':
      return '执行中'
    case 'success':
      return '已完成'
    case 'failed':
      return '失败'
    case 'skipped':
      return '已跳过'
    case 'cancelled':
      return '已取消'
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

function getStepIterations(stepIndex: number): PlanStepIteration[] {
  return props.planState?.stepIterations?.[stepIndex] ?? []
}

function getIterationStatusLabel(iteration: PlanStepIteration): string {
  switch (iteration.status) {
    case 'thinking':
      return '思考中'
    case 'calling_tools':
      return '调用工具'
    case 'processing':
      return '处理中'
    case 'complete':
      return '完成'
  }
}

function isStepActive(step: PlanStep): boolean {
  return step.status === 'running'
}

function isStepExpanded(step: PlanStep): boolean {
  // 当前正在执行的步骤自动展开
  if (isStepActive(step)) return true
  // 如果用户手动展开了面板，已完成的步骤也展开
  if (isExpanded.value) return true
  return false
}
</script>

<template>
  <Transition name="paper-chat-plan-dock-fade">
    <section
      v-if="shouldShow"
      :class="styles['paper-chat-plan-dock']"
      :class="[`is-${planState?.status}`, { 'is-fading': fadeState === 'fading' }]"
    >
      <div
        v-if="!hasSteps && planState?.status === 'planning'"
        :class="styles['paper-chat-plan-dock__waiting']"
      >
        <span :class="styles['paper-chat-plan-dock__dot']" aria-hidden="true"></span>
        <PlanningStatusIndicator />
      </div>

      <div v-else-if="!hasSteps" :class="styles['paper-chat-plan-dock__empty-status']">
        <span :class="styles['paper-chat-plan-dock__status-label']">{{ statusLabel }}</span>
        <span :class="styles['paper-chat-plan-dock__summary']">{{ summaryText }}</span>
      </div>

      <template v-else>
        <button
          type="button"
          :class="styles['paper-chat-plan-dock__header']"
          :aria-expanded="isExpanded"
          @click="toggleExpanded"
        >
          <div :class="styles['paper-chat-plan-dock__header-main']">
            <span :class="styles['paper-chat-plan-dock__status-label']">{{ statusLabel }}</span>
            <span :class="styles['paper-chat-plan-dock__summary']">{{ summaryText }}</span>
          </div>
          <span class="paper-chat-plan-dock__chevron" :class="{ 'is-expanded': isExpanded }"
            >▶</span
          >
        </button>

        <Transition name="paper-chat-plan-dock-expand">
          <div v-if="isExpanded" :class="styles['paper-chat-plan-dock__body']">
            <div :class="styles['paper-chat-plan-dock__list']">
              <div
                v-for="step in steps"
                :key="step.index"
                :class="styles['paper-chat-plan-dock__task']"
                :class="`is-${step.status}`"
              >
                <!-- 任务行 -->
                <div :class="styles['paper-chat-plan-dock__task-row']">
                  <span :class="styles['paper-chat-plan-dock__task-number']">
                    任务 {{ step.index + 1 }}
                  </span>
                  <span :class="styles['paper-chat-plan-dock__task-state']">
                    {{ getStepStatusLabel(step) }}
                  </span>
                  <div :class="styles['paper-chat-plan-dock__task-main']">
                    <span :class="styles['paper-chat-plan-dock__task-title']">{{
                      step.title
                    }}</span>
                    <span
                      v-if="getStepDetail(step)"
                      :class="styles['paper-chat-plan-dock__task-detail']"
                    >
                      {{ getStepDetail(step) }}
                    </span>
                  </div>
                </div>

                <!-- 阶段列表 -->
                <div
                  v-if="getStepIterations(step.index).length > 0 && isStepExpanded(step)"
                  :class="styles['paper-chat-plan-dock__phases']"
                >
                  <div
                    v-for="iter in getStepIterations(step.index)"
                    :key="iter.localPhaseNumber"
                    :class="styles['paper-chat-plan-dock__phase']"
                    :class="`is-${iter.status}`"
                  >
                    <span :class="styles['paper-chat-plan-dock__phase-label']">
                      阶段 {{ iter.stepNumber }}.{{ iter.localPhaseNumber }}
                    </span>
                    <span :class="styles['paper-chat-plan-dock__phase-state']">
                      {{ getIterationStatusLabel(iter) }}
                    </span>
                    <span
                      v-if="iter.toolSummary"
                      :class="styles['paper-chat-plan-dock__phase-tools']"
                    >
                      {{ iter.toolSummary }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </template>
    </section>
  </Transition>
</template>
