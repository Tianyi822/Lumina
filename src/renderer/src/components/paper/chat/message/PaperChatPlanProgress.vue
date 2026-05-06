<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PlanStep } from '@renderer/types'

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
  <div v-if="hasContent" class="paper-chat-plan-progress">
    <button
      class="paper-chat-plan-progress__header"
      type="button"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div class="paper-chat-plan-progress__header-left">
        <span class="paper-chat-plan-progress__title">执行计划</span>
        <span class="paper-chat-plan-progress__badge">
          {{ completedCount }}/{{ totalCount }} 步骤
        </span>
        <span v-if="planExecution?.isActive" class="paper-chat-plan-progress__streaming-indicator">
          <span class="paper-chat-plan-progress__pulse-dot"></span>
          执行中
        </span>
      </div>

      <div class="paper-chat-plan-progress__header-right">
        <span class="paper-chat-plan-progress__expand-icon" :class="{ expanded: isExpanded }"
          >▶</span
        >
      </div>
    </button>

    <Transition name="paper-chat-plan-expand">
      <div v-if="isExpanded" class="paper-chat-plan-progress__content">
        <div class="paper-chat-plan-progress__timeline">
          <div
            v-for="step in planExecution?.steps"
            :key="step.index"
            class="paper-chat-plan-progress__step"
            :class="{ active: step.status === 'running' }"
          >
            <div class="paper-chat-plan-progress__step-rail">
              <span class="paper-chat-plan-progress__node" :class="getStatusClass(step.status)">{{
                getStatusIcon(step.status)
              }}</span>
            </div>

            <div class="paper-chat-plan-progress__step-main">
              <div class="paper-chat-plan-progress__step-title">{{ step.title }}</div>
              <div v-if="step.status === 'running'" class="paper-chat-plan-progress__step-desc">
                {{ step.description }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.paper-chat-plan-progress {
  margin: 0;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  overflow: hidden;
}

.paper-chat-plan-progress__header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: 11px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.paper-chat-plan-progress__header:hover {
  background: var(--sm-color-surface-hover);
}

.paper-chat-plan-progress__header-left {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
  flex-wrap: wrap;
}

.paper-chat-plan-progress__header-right {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
}

.paper-chat-plan-progress__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-chat-plan-progress__badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--sm-color-accent-22);
  border-radius: 999px;
  background: var(--sm-color-accent-08);
  color: var(--sm-color-accent-hover);
  font-size: 11px;
  font-weight: 600;
}

.paper-chat-plan-progress__streaming-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.paper-chat-plan-progress__pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sm-color-accent);
  animation: pulse 1.8s infinite;
}

.paper-chat-plan-progress__expand-icon {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.paper-chat-plan-progress__expand-icon.expanded {
  transform: rotate(90deg);
}

.paper-chat-plan-progress__content {
  border-top: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-plan-progress__timeline {
  padding: 14px;
}

.paper-chat-plan-progress__step {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
}

.paper-chat-plan-progress__step:last-child {
  padding-bottom: 0;
}

.paper-chat-plan-progress__step-rail {
  position: relative;
  width: 14px;
  flex-shrink: 0;
}

.paper-chat-plan-progress__step-rail::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 14px;
  bottom: -16px;
  width: 2px;
  background: var(--sm-color-border-default);
}

.paper-chat-plan-progress__step:last-child .paper-chat-plan-progress__step-rail::after {
  display: none;
}

.paper-chat-plan-progress__node {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 8px;
  font-weight: 700;
}

.paper-chat-plan-progress__node--pending {
  border: 2px solid var(--sm-color-border-strong);
  background: var(--sm-color-surface-1);
  color: transparent;
}

.paper-chat-plan-progress__node--running {
  border: 2px solid var(--sm-color-accent);
  background: var(--sm-color-accent-12);
  color: var(--sm-color-accent);
  animation: pulse 1.8s infinite;
}

.paper-chat-plan-progress__node--success {
  border: 2px solid var(--sm-color-status-success);
  background: var(--sm-color-status-success);
  color: #fff;
}

.paper-chat-plan-progress__node--failed {
  border: 2px solid var(--sm-color-status-danger);
  background: var(--sm-color-status-danger);
  color: #fff;
}

.paper-chat-plan-progress__node--skipped {
  border: 2px solid var(--sm-color-border-strong);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-tertiary);
}

.paper-chat-plan-progress__step-main {
  flex: 1;
  min-width: 0;
  padding-top: 0;
}

.paper-chat-plan-progress__step-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  line-height: 1.4;
}

.paper-chat-plan-progress__step--success .paper-chat-plan-progress__step-title {
  color: var(--sm-color-text-secondary);
}

.paper-chat-plan-progress__step--failed .paper-chat-plan-progress__step-title {
  color: var(--sm-color-status-danger);
}

.paper-chat-plan-progress__step-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
  line-height: 1.4;
}

.paper-chat-plan-expand-enter-active {
  animation: expandIn 160ms ease;
}

.paper-chat-plan-expand-leave-active {
  animation: expandOut 140ms ease;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 0.82;
  }
}

@keyframes expandIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes expandOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
