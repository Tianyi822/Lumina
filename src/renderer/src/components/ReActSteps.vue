<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, ref, watch } from 'vue'
import type { ReactIterationStatus, ReActIteration, ReActStep } from '@renderer/types'
import ToolCallPanel from './ToolCallPanel.vue'
import type { ToolCallPanelItem } from './ToolCallPanel.vue'
import SvgIcon from './icons/SvgIcon.vue'
import IterationPlaceholder from './chat/message/IterationPlaceholder.vue'

interface PhaseUnit {
  key: string
  iteration: number
  reasoning: string
  toolItems: ToolCallPanelItem[]
  isActive: boolean
  status?: ReactIterationStatus
}

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
})

const props = defineProps<{
  steps?: ReActStep[]
  iterations?: ReActIteration[]
  isStreaming?: boolean
}>()

// 整体面板的展开状态
const isExpanded = ref(false)

// 已展开的思考阶段
const expandedReasoningSet = ref<Set<string>>(new Set())

// 是否使用阶段化展示
const useIterationMode = computed(() => {
  return (
    props.iterations?.some(
      (iteration) =>
        iteration.isActive || iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
    ) || false
  )
})

// 工具结果统计
const toolStats = computed(() => {
  const allResults: ReActStep[] = []

  if (useIterationMode.value) {
    for (const iteration of props.iterations || []) {
      allResults.push(...iteration.steps.filter((step) => step.type === 'tool_result'))
    }
  } else {
    allResults.push(...(props.steps || []).filter((step) => step.type === 'tool_result'))
  }

  return {
    success: allResults.filter((step) => step.toolResult?.success).length,
    failed: allResults.filter((step) => !step.toolResult?.success).length
  }
})

// 平铺模式下的工具列表
const legacyToolItems = computed(() => {
  return stepsToToolCallItems(props.steps || [], props.isStreaming)
})

// 按阶段组织后的展示单元
const phaseUnits = computed<PhaseUnit[]>(() => {
  return (
    (props.iterations || [])
      .map((iteration) => ({
        key: `iter-${iteration.iteration}`,
        iteration: iteration.iteration,
        reasoning: iteration.reasoning,
        toolItems: stepsToToolCallItems(iteration.steps, props.isStreaming && !!iteration.isActive),
        isActive: !!iteration.isActive,
        status: iteration.status
      }))
      // 保留活跃的迭代（即使为空），或者有内容的迭代
      .filter(
        (unit) => unit.isActive || unit.reasoning.trim().length > 0 || unit.toolItems.length > 0
      )
  )
})

// 当前内容是否可展示
const hasContent = computed(() => {
  if (useIterationMode.value) {
    return phaseUnits.value.length > 0
  }

  return legacyToolItems.value.length > 0
})

// 阶段数量
const phaseCount = computed(() => phaseUnits.value.length)

// 工具调用数量
const toolCount = computed(() => {
  if (useIterationMode.value) {
    return phaseUnits.value.reduce((sum, unit) => sum + unit.toolItems.length, 0)
  }

  return legacyToolItems.value.length
})

watch(
  () => props.isStreaming,
  (streaming, previousStreaming) => {
    if (streaming && !previousStreaming) {
      isExpanded.value = true
    }
  },
  { immediate: true }
)

watch(
  phaseUnits,
  (units) => {
    if (props.isStreaming && units.length > 0) {
      isExpanded.value = true
    }

    for (const unit of units) {
      if (unit.isActive && unit.reasoning.trim().length > 0) {
        expandedReasoningSet.value.add(unit.key)
      }
    }
  },
  { deep: true, immediate: true }
)

/**
 * 将步骤转换为工具卡片数据
 */
function stepsToToolCallItems(steps: ReActStep[], isStreaming?: boolean): ToolCallPanelItem[] {
  const items: ToolCallPanelItem[] = []
  const pendingCalls = new Map<string, { index: number }>()

  steps.forEach((step, index) => {
    if (step.type === 'tool_call' && step.toolCall) {
      pendingCalls.set(step.toolCall.id, { index: items.length })
      items.push({
        id: step.toolCall.id,
        name: step.toolCall.name,
        serverName: step.toolCall.serverName,
        params: step.toolCall.arguments || {},
        status: isStreaming && index === steps.length - 1 ? 'running' : 'pending',
        startTime: step.timestamp
      })
      return
    }

    if (step.type === 'tool_result' && step.toolResult) {
      const pending = pendingCalls.get(step.toolResult.id)
      if (!pending) {
        return
      }

      const item = items[pending.index]
      if (!item) {
        return
      }

      item.status = step.toolResult.success ? 'success' : 'error'
      item.result = step.toolResult.result
      item.error = step.toolResult.error
      item.endTime = step.timestamp
      pendingCalls.delete(step.toolResult.id)
    }
  })

  return items
}

/**
 * 切换整体展开状态
 */
function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
}

/**
 * 切换阶段内思考的展开状态
 */
function toggleReasoning(unitKey: string): void {
  if (expandedReasoningSet.value.has(unitKey)) {
    expandedReasoningSet.value.delete(unitKey)
  } else {
    expandedReasoningSet.value.add(unitKey)
  }
}

/**
 * 检查某个阶段是否已展开
 */
function isReasoningExpanded(unit: PhaseUnit): boolean {
  return expandedReasoningSet.value.has(unit.key)
}

/**
 * 渲染 Markdown 内容
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

/**
 * 获取阶段标签
 */
function getPhaseLabel(iteration: number): string {
  return `第 ${iteration + 1} 阶段`
}
</script>

<template>
  <div v-if="hasContent" class="react-steps-container">
    <button class="react-header" type="button" :aria-expanded="isExpanded" @click="toggleExpand">
      <div class="header-left">
        <span class="react-title">分阶段推理</span>
        <span class="react-badge">
          {{ useIterationMode ? `${phaseCount} 个阶段` : `${toolCount} 次调用` }}
        </span>
        <span v-if="isStreaming" class="streaming-indicator">
          <span class="pulse-dot"></span>
          进行中
        </span>
      </div>

      <div class="header-right">
        <span v-if="toolStats.success > 0" class="stat-badge success"
          >✓ {{ toolStats.success }}</span
        >
        <span v-if="toolStats.failed > 0" class="stat-badge error">✗ {{ toolStats.failed }}</span>
        <span class="expand-icon" :class="{ expanded: isExpanded }">▶</span>
      </div>
    </button>

    <Transition name="expand-collapse">
      <div v-if="isExpanded" class="react-content">
        <template v-if="useIterationMode">
          <div class="phase-timeline">
            <TransitionGroup name="phase-item" tag="div">
              <section
                v-for="unit in phaseUnits"
                :key="unit.key"
                class="phase-unit"
                :class="{ active: unit.isActive }"
              >
                <div class="phase-rail">
                  <span class="phase-node" :class="{ active: unit.isActive }"></span>
                </div>

                <div class="phase-main">
                  <!-- 活跃但空的迭代：显示占位符 -->
                  <template v-if="unit.isActive && !unit.reasoning && unit.toolItems.length === 0">
                    <IterationPlaceholder :iteration="unit.iteration" :status="unit.status" />
                  </template>

                  <!-- 有内容的迭代：显示思考面板和工具列表 -->
                  <template v-else>
                    <div class="phase-meta">
                      <span class="phase-label">{{ getPhaseLabel(unit.iteration) }}</span>
                      <span v-if="unit.toolItems.length > 0" class="phase-count">
                        {{ unit.toolItems.length }} 次工具调用
                      </span>
                      <span v-if="unit.isActive && isStreaming" class="phase-streaming">
                        <span class="pulse-dot-sm"></span>
                        实时更新中
                      </span>
                    </div>

                    <div
                      v-if="unit.reasoning"
                      class="reasoning-panel"
                      :class="{ expanded: isReasoningExpanded(unit) }"
                    >
                      <button
                        class="reasoning-header"
                        type="button"
                        :aria-expanded="isReasoningExpanded(unit)"
                        @click="toggleReasoning(unit.key)"
                      >
                        <div class="reasoning-header-left">
                          <SvgIcon name="info" class="reasoning-icon" :size="16" />
                          <span class="reasoning-label">思考</span>
                        </div>

                        <span
                          class="reasoning-arrow"
                          :class="{ expanded: isReasoningExpanded(unit) }"
                          >▶</span
                        >
                      </button>

                      <div class="reasoning-body" :class="{ expanded: isReasoningExpanded(unit) }">
                        <div class="reasoning-content">
                          <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
                          <!-- eslint-disable vue/no-v-html -->
                          <div
                            class="reasoning-text markdown-body"
                            v-html="renderMarkdown(unit.reasoning)"
                          ></div>
                          <!-- eslint-enable vue/no-v-html -->
                        </div>
                      </div>
                    </div>

                    <div v-if="unit.toolItems.length > 0" class="tool-list">
                      <TransitionGroup name="tool-item" tag="div" class="tool-list-inner">
                        <ToolCallPanel
                          v-for="(item, index) in unit.toolItems"
                          :key="item.id"
                          :tool-call="item"
                          :index="index"
                        />
                      </TransitionGroup>
                    </div>
                  </template>
                </div>
              </section>
            </TransitionGroup>
          </div>
        </template>

        <template v-else>
          <div class="legacy-timeline">
            <TransitionGroup name="tool-item" tag="div" class="tool-list-inner">
              <ToolCallPanel
                v-for="(item, index) in legacyToolItems"
                :key="item.id"
                :tool-call="item"
                :index="index"
              />
            </TransitionGroup>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.react-steps-container {
  margin: 0;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  overflow: hidden;
}

.react-header {
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

.react-header:hover {
  background: var(--sm-color-surface-hover);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
  flex-wrap: wrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.react-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.react-badge {
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

.streaming-indicator,
.phase-streaming {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.pulse-dot,
.pulse-dot-sm {
  border-radius: 50%;
  background: var(--sm-color-accent);
  animation: pulse 1.8s infinite;
}

.pulse-dot {
  width: 6px;
  height: 6px;
}

.pulse-dot-sm {
  width: 5px;
  height: 5px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.stat-badge.success {
  border-color: rgba(127, 176, 138, 0.24);
  background: rgba(127, 176, 138, 0.08);
  color: var(--sm-color-status-success);
}

.stat-badge.error {
  border-color: rgba(199, 120, 120, 0.24);
  background: rgba(199, 120, 120, 0.08);
  color: var(--sm-color-status-danger);
}

.expand-icon {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.react-content {
  border-top: 1px solid var(--sm-color-border-subtle);
}

.phase-timeline,
.legacy-timeline {
  padding: 14px;
}

.phase-unit {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
}

.phase-unit:last-child {
  padding-bottom: 0;
}

.phase-rail {
  position: relative;
  width: 14px;
  flex-shrink: 0;
}

.phase-rail::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 14px;
  bottom: -16px;
  width: 2px;
  background: var(--sm-color-border-default);
}

.phase-unit:last-child .phase-rail::after {
  display: none;
}

.phase-node {
  position: relative;
  z-index: 1;
  display: block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--sm-color-border-strong);
  border-radius: 50%;
  background: var(--sm-color-surface-1);
}

.phase-node.active {
  border-color: var(--sm-color-accent);
  background: var(--sm-color-accent-12);
}

.phase-main {
  flex: 1;
  min-width: 0;
}

.phase-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-bottom: 8px;
}

.phase-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sm-color-text-secondary);
  letter-spacing: 0.02em;
}

.phase-count {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
}

.reasoning-panel {
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  overflow: hidden;
}

.reasoning-panel.expanded {
  border-color: var(--sm-color-accent-28);
}

.reasoning-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.reasoning-header:hover {
  background: var(--sm-color-surface-hover);
}

.reasoning-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reasoning-icon {
  width: 16px;
  height: 16px;
  color: var(--sm-color-accent-hover);
}

.reasoning-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.reasoning-arrow {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.reasoning-arrow.expanded {
  transform: rotate(90deg);
}

.reasoning-body {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 180ms ease,
    opacity 140ms ease;
}

.reasoning-body.expanded {
  max-height: 420px;
  opacity: 1;
}

.reasoning-content {
  padding: 0 12px 12px;
  max-height: 400px;
  overflow-y: auto;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.reasoning-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--sm-color-text-secondary);
}

.tool-list {
  margin-top: 12px;
}

.tool-list-inner :deep(.tool-call-panel) {
  margin: 0 0 8px;
}

.tool-list-inner :deep(.tool-call-panel:last-child) {
  margin-bottom: 0;
}

.expand-collapse-enter-active {
  animation: expandIn 160ms ease;
}

.expand-collapse-leave-active {
  animation: expandOut 140ms ease;
}

.tool-item-enter-active,
.phase-item-enter-active {
  animation: itemIn 160ms ease;
}

.tool-item-move,
.phase-item-move {
  transition: transform 160ms ease;
}

.tool-item-leave-active,
.phase-item-leave-active {
  animation: itemOut 140ms ease;
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

@keyframes itemIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes itemOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(6px);
  }
}

.reasoning-content::-webkit-scrollbar,
.react-content::-webkit-scrollbar {
  width: 4px;
}

.reasoning-content::-webkit-scrollbar-thumb,
.react-content::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.reasoning-text.markdown-body :deep(p) {
  margin: 0 0 0.5em;
}

.reasoning-text.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.reasoning-text.markdown-body :deep(code) {
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-accent-hover);
  font-size: 0.92em;
}

.reasoning-text.markdown-body :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  border-radius: var(--sm-radius-md);
  overflow-x: auto;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
}

.reasoning-text.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--sm-color-text-secondary);
}

.reasoning-text.markdown-body :deep(ul),
.reasoning-text.markdown-body :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}

@media (max-width: 768px) {
  .react-header {
    padding: 10px 12px;
  }

  .phase-unit {
    gap: 10px;
  }

  .phase-meta {
    gap: 6px;
  }
}
</style>
