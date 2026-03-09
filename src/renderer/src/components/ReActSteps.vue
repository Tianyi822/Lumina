<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, ref, watch } from 'vue'
import type { ReActIteration, ReActStep } from '@renderer/types'
import ToolCallPanel from './ToolCallPanel.vue'
import type { ToolCallPanelItem } from './ToolCallPanel.vue'

interface PhaseUnit {
  key: string
  iteration: number
  reasoning: string
  toolItems: ToolCallPanelItem[]
  isActive: boolean
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
      (iteration) => iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
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
  return (props.iterations || [])
    .map((iteration) => ({
      key: `iter-${iteration.iteration}`,
      iteration: iteration.iteration,
      reasoning: iteration.reasoning,
      toolItems: stepsToToolCallItems(iteration.steps, props.isStreaming && !!iteration.isActive),
      isActive: !!iteration.isActive
    }))
    .filter((unit) => unit.reasoning.trim().length > 0 || unit.toolItems.length > 0)
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

/**
 * 工具卡片展开回调
 */
function handleToolExpand(_toolId: string): void {
  // 预留埋点或滚动逻辑
}
</script>

<template>
  <div v-if="hasContent" class="react-steps-container">
    <button class="react-header" type="button" @click="toggleExpand">
      <div class="header-left">
        <span class="react-icon">⚡</span>
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
                      @click="toggleReasoning(unit.key)"
                    >
                      <div class="reasoning-header-left">
                        <svg
                          class="reasoning-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span class="reasoning-label">思考</span>
                      </div>

                      <span class="reasoning-arrow" :class="{ expanded: isReasoningExpanded(unit) }"
                        >▶</span
                      >
                    </button>

                    <div class="reasoning-body" :class="{ expanded: isReasoningExpanded(unit) }">
                      <div class="reasoning-content">
                        <div
                          class="reasoning-text markdown-body"
                          v-html="renderMarkdown(unit.reasoning)"
                        ></div>
                        <span v-if="unit.isActive && isStreaming" class="streaming-cursor">▊</span>
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
                        @toggle-expand="handleToolExpand"
                      />
                    </TransitionGroup>
                  </div>
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
                @toggle-expand="handleToolExpand"
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
  margin: var(--theme-spacing) 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background:
    linear-gradient(
      180deg,
      var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
      var(--glass-white-01, rgba(255, 255, 255, 0.01)) 100%
    ),
    var(--theme-bg-secondary);
  overflow: hidden;
}

.react-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-spacing);
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.react-header:hover {
  background: var(--theme-bg-hover);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.react-icon {
  font-size: 14px;
}

.react-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
}

.react-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--theme-accent);
  color: var(--theme-bg);
  font-size: 11px;
  font-weight: 600;
}

.streaming-indicator,
.phase-streaming {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--theme-accent);
}

.pulse-dot,
.pulse-dot-sm {
  border-radius: 50%;
  background: var(--theme-accent);
  animation: pulse 1.5s infinite;
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
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.stat-badge.success {
  background: rgba(16, 185, 129, 0.14);
  color: var(--theme-success);
}

.stat-badge.error {
  background: rgba(248, 81, 73, 0.14);
  color: var(--theme-danger);
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
  transition: transform 0.2s ease;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.react-content {
  border-top: 1px solid var(--theme-border);
}

.phase-timeline,
.legacy-timeline {
  padding: 12px;
}

.phase-unit {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 18px;
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
  bottom: -18px;
  width: 2px;
  background: linear-gradient(to bottom, var(--theme-border-hover), rgba(255, 255, 255, 0.04));
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
  border: 2px solid var(--theme-border-hover);
  border-radius: 50%;
  background: var(--theme-bg);
}

.phase-node.active {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12);
}

.phase-main {
  flex: 1;
  min-width: 0;
}

.phase-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.phase-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-text-secondary);
  letter-spacing: 0.02em;
}

.phase-count {
  font-size: 11px;
  color: var(--theme-text-tertiary);
}

.reasoning-panel {
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background:
    linear-gradient(
      135deg,
      var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 100%
    ),
    var(--theme-bg);
  overflow: hidden;
}

.reasoning-panel.expanded {
  border-color: var(--thinking-border, rgba(99, 102, 241, 0.2));
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
}

.reasoning-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reasoning-icon {
  width: 16px;
  height: 16px;
  color: var(--thinking-accent, var(--theme-accent-secondary));
}

.reasoning-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text-secondary);
}

.reasoning-arrow {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  transition: transform 0.2s ease;
}

.reasoning-arrow.expanded {
  transform: rotate(90deg);
}

.reasoning-body {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 0.25s ease,
    opacity 0.2s ease;
}

.reasoning-body.expanded {
  max-height: 420px;
  opacity: 1;
}

.reasoning-content {
  padding: 0 12px 12px;
  max-height: 400px;
  overflow-y: auto;
}

.reasoning-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
}

.tool-list {
  margin-top: 10px;
}

.tool-list-inner :deep(.tool-call-panel) {
  margin: 0 0 8px;
}

.tool-list-inner :deep(.tool-call-panel:last-child) {
  margin-bottom: 0;
}

.streaming-cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--theme-accent);
  animation: blink 1s step-end infinite;
}

.expand-collapse-enter-active {
  animation: expandIn 0.24s ease;
}

.expand-collapse-leave-active {
  animation: expandOut 0.18s ease;
}

.tool-item-enter-active,
.phase-item-enter-active {
  animation: itemIn 0.24s ease;
}

.tool-item-move,
.phase-item-move {
  transition: transform 0.24s ease;
}

.tool-item-leave-active,
.phase-item-leave-active {
  animation: itemOut 0.18s ease;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.55;
    transform: scale(0.8);
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
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
  background: var(--glass-white-15, rgba(255, 255, 255, 0.15));
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
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  color: var(--theme-accent);
  font-size: 0.92em;
}

.reasoning-text.markdown-body :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
}

.reasoning-text.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  color: var(--theme-text-secondary);
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
