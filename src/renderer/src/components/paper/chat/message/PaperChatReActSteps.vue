<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, ref, watch } from 'vue'
import type { ReActIteration, ReActStep, UiReactIterationStatus } from '@renderer/types'
import PaperChatToolCallPanel from './PaperChatToolCallPanel.vue'
import type { PaperChatToolCallPanelItem } from './PaperChatToolCallPanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import PaperChatIterationPlaceholder from './PaperChatIterationPlaceholder.vue'
import {
  derivePaperChatStepContent,
  type PaperChatStepContentResult
} from './paperChatReactStepContent'

interface PhaseUnit {
  key: string
  iteration: number
  reasoning: string
  toolItems: PaperChatToolCallPanelItem[]
  isActive: boolean
  status?: UiReactIterationStatus
  content?: string
  stepContent?: PaperChatStepContentResult | null
  taskNumber?: number
}

interface TaskGroup {
  taskNumber: number
  units: PhaseUnit[]
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
  planSummary?: string
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
        iteration.isActive ||
        iteration.reasoning.trim().length > 0 ||
        iteration.steps.length > 0 ||
        (iteration.content?.trim().length ?? 0) > 0
    ) || false
  )
})

// 工具结果统计 —— 与 toolCount 使用相同数据源
const toolStats = computed(() => {
  const items = useIterationMode.value
    ? phaseUnits.value.flatMap((u) => u.toolItems)
    : legacyToolItems.value

  return {
    success: items.filter((item) => item.status === 'success').length,
    failed: items.filter((item) => item.status === 'error').length
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
      .map((iteration) => {
        const toolItems = stepsToToolCallItems(
          iteration.steps,
          props.isStreaming && !!iteration.isActive
        )

        return {
          key: `iter-${iteration.iteration}`,
          iteration: iteration.iteration,
          reasoning: trimConclusionPromise(iteration.reasoning, iteration.content),
          toolItems,
          isActive: !!iteration.isActive,
          status: iteration.status,
          content: iteration.content,
          stepContent: derivePaperChatStepContent(toolItems, iteration.content),
          taskNumber: iteration.taskNumber
        }
      })
      // 保留活跃的迭代（即使为空），或者有内容的迭代
      .filter(
        (unit) =>
          unit.isActive ||
          unit.reasoning.trim().length > 0 ||
          unit.toolItems.length > 0 ||
          !!unit.stepContent
      )
  )
})

// 是否有任务分组（Plan 模式下）
const hasTaskGroups = computed(() => {
  return phaseUnits.value.some((unit) => unit.taskNumber !== undefined)
})

// 按任务分组
const taskGroups = computed<TaskGroup[]>(() => {
  if (!hasTaskGroups.value) return []

  const groups: TaskGroup[] = []
  for (const unit of phaseUnits.value) {
    const tn = unit.taskNumber ?? 0
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.taskNumber === tn) {
      lastGroup.units.push(unit)
    } else {
      groups.push({ taskNumber: tn, units: [unit] })
    }
  }
  return groups
})

// 当前内容是否可展示
const hasContent = computed(() => {
  if (useIterationMode.value) {
    return phaseUnits.value.length > 0
  }

  return legacyToolItems.value.length > 0
})

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
function stepsToToolCallItems(
  steps: ReActStep[],
  isStreaming?: boolean
): PaperChatToolCallPanelItem[] {
  const items: PaperChatToolCallPanelItem[] = []
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
 * 当 reasoning 以结论承诺语句（如"现在可以给出步骤结论"）结尾，
 * 但 iteration 没有实际的 content 时，裁剪掉该承诺语句，避免用户困惑
 */
function trimConclusionPromise(reasoning: string, content?: string): string {
  if (content?.trim()) return reasoning
  return reasoning.replace(/[\s]*现在可以给出步骤结论[。\s]*$/, '').trimEnd()
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
function getPhaseLabel(unit: PhaseUnit): string {
  if (unit.taskNumber !== undefined) {
    const localIndex = getLocalPhaseIndex(unit)
    return `阶段 ${unit.taskNumber}.${localIndex}`
  }
  return `第 ${unit.iteration + 1} 阶段`
}

/**
 * 获取阶段在当前任务内的局部编号（1-based）
 */
function getLocalPhaseIndex(unit: PhaseUnit): number {
  if (!hasTaskGroups.value) return unit.iteration + 1
  const group = taskGroups.value.find((g) => g.taskNumber === unit.taskNumber)
  if (!group) return unit.iteration + 1
  const idx = group.units.indexOf(unit)
  return idx >= 0 ? idx + 1 : unit.iteration + 1
}
</script>

<template>
  <div v-if="hasContent" class="paper-chat-react-steps">
    <button
      class="paper-chat-react-steps__header"
      type="button"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div class="paper-chat-react-steps__header-left">
        <span class="paper-chat-react-steps__title">分阶段推理</span>
        <span class="paper-chat-react-steps__badge"> {{ toolCount }} 次工具调用 </span>
        <span v-if="isStreaming" class="paper-chat-react-steps__streaming-indicator">
          <span class="paper-chat-react-steps__pulse-dot"></span>
          进行中
        </span>
      </div>

      <div class="paper-chat-react-steps__header-right">
        <span v-if="toolStats.success > 0" class="paper-chat-react-steps__stat-badge success"
          >✓ {{ toolStats.success }}</span
        >
        <span v-if="toolStats.failed > 0" class="paper-chat-react-steps__stat-badge error"
          >✗ {{ toolStats.failed }}</span
        >
        <span class="paper-chat-react-steps__expand-icon" :class="{ expanded: isExpanded }">▶</span>
      </div>
    </button>

    <Transition name="paper-chat-react-expand">
      <div v-if="isExpanded" class="paper-chat-react-steps__content">
        <template v-if="useIterationMode">
          <!-- Plan 模式：按任务分组 -->
          <div v-if="hasTaskGroups" class="paper-chat-react-steps__phase-timeline">
            <div
              v-for="group in taskGroups"
              :key="`task-${group.taskNumber}`"
              class="paper-chat-react-steps__task-group"
            >
              <div class="paper-chat-react-steps__task-divider">
                <span class="paper-chat-react-steps__task-divider-label">
                  任务 {{ group.taskNumber }}
                </span>
              </div>
              <TransitionGroup name="paper-chat-react-phase" tag="div">
                <section
                  v-for="unit in group.units"
                  :key="unit.key"
                  class="paper-chat-react-steps__phase"
                  :class="{ active: unit.isActive }"
                >
                  <div class="paper-chat-react-steps__phase-rail">
                    <span
                      class="paper-chat-react-steps__phase-node"
                      :class="{ active: unit.isActive }"
                    ></span>
                  </div>

                  <div class="paper-chat-react-steps__phase-main">
                    <template
                      v-if="unit.isActive && !unit.reasoning && unit.toolItems.length === 0"
                    >
                      <PaperChatIterationPlaceholder
                        :iteration="unit.iteration"
                        :status="unit.status"
                      />
                    </template>

                    <template v-else>
                      <div class="paper-chat-react-steps__phase-meta">
                        <span class="paper-chat-react-steps__phase-label">{{
                          getPhaseLabel(unit)
                        }}</span>
                        <span
                          v-if="unit.toolItems.length > 0"
                          class="paper-chat-react-steps__phase-count"
                        >
                          {{ unit.toolItems.length }} 次工具调用
                        </span>
                        <span
                          v-if="unit.isActive && isStreaming"
                          class="paper-chat-react-steps__phase-streaming"
                        >
                          <span class="paper-chat-react-steps__pulse-dot--small"></span>
                          实时更新中
                        </span>
                      </div>

                      <div
                        v-if="unit.reasoning"
                        class="paper-chat-react-steps__reasoning"
                        :class="{ expanded: isReasoningExpanded(unit) }"
                      >
                        <button
                          class="paper-chat-react-steps__reasoning-header"
                          type="button"
                          :aria-expanded="isReasoningExpanded(unit)"
                          @click="toggleReasoning(unit.key)"
                        >
                          <div class="paper-chat-react-steps__reasoning-header-left">
                            <SvgIcon
                              name="info"
                              class="paper-chat-react-steps__reasoning-icon"
                              :size="16"
                            />
                            <span class="paper-chat-react-steps__reasoning-label">思考</span>
                          </div>

                          <span
                            class="paper-chat-react-steps__reasoning-arrow"
                            :class="{ expanded: isReasoningExpanded(unit) }"
                            >▶</span
                          >
                        </button>

                        <div
                          class="paper-chat-react-steps__reasoning-body"
                          :class="{ expanded: isReasoningExpanded(unit) }"
                        >
                          <div class="paper-chat-react-steps__reasoning-content">
                            <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
                            <!-- eslint-disable vue/no-v-html -->
                            <div
                              class="paper-chat-react-steps__reasoning-text markdown-body"
                              v-html="renderMarkdown(unit.reasoning)"
                            ></div>
                            <!-- eslint-enable vue/no-v-html -->
                          </div>
                        </div>
                      </div>

                      <div
                        v-if="unit.toolItems.length > 0"
                        class="paper-chat-react-steps__tool-list"
                      >
                        <TransitionGroup
                          name="paper-chat-react-tool"
                          tag="div"
                          class="paper-chat-react-steps__tool-list-inner"
                        >
                          <PaperChatToolCallPanel
                            v-for="(item, index) in unit.toolItems"
                            :key="item.id"
                            :tool-call="item"
                            :index="index"
                          />
                        </TransitionGroup>
                      </div>

                      <!-- 阶段内的文本内容 -->
                      <div
                        v-if="unit.stepContent"
                        class="paper-chat-react-steps__step-content"
                        :class="`is-${unit.stepContent.tone}`"
                      >
                        <!-- eslint-disable vue/no-v-html -->
                        <div
                          class="paper-chat-react-steps__step-content-text markdown-body"
                          v-html="renderMarkdown(unit.stepContent.content)"
                        ></div>
                        <!-- eslint-enable vue/no-v-html -->
                      </div>
                    </template>
                  </div>
                </section>
              </TransitionGroup>
            </div>
          </div>

          <!-- Plan 模式：最终总结 -->
          <div
            v-if="hasTaskGroups && planSummary && !isStreaming"
            class="paper-chat-react-steps__plan-summary"
          >
            <div class="paper-chat-react-steps__plan-summary-divider">
              <span class="paper-chat-react-steps__plan-summary-divider-label">总结</span>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="paper-chat-react-steps__plan-summary-text markdown-body"
              v-html="renderMarkdown(planSummary)"
            ></div>
            <!-- eslint-enable vue/no-v-html -->
          </div>

          <!-- 非 Plan 模式：扁平阶段列表 -->
          <div v-else class="paper-chat-react-steps__phase-timeline">
            <TransitionGroup name="paper-chat-react-phase" tag="div">
              <section
                v-for="unit in phaseUnits"
                :key="unit.key"
                class="paper-chat-react-steps__phase"
                :class="{ active: unit.isActive }"
              >
                <div class="paper-chat-react-steps__phase-rail">
                  <span
                    class="paper-chat-react-steps__phase-node"
                    :class="{ active: unit.isActive }"
                  ></span>
                </div>

                <div class="paper-chat-react-steps__phase-main">
                  <!-- 活跃但空的迭代：显示占位符 -->
                  <template v-if="unit.isActive && !unit.reasoning && unit.toolItems.length === 0">
                    <PaperChatIterationPlaceholder
                      :iteration="unit.iteration"
                      :status="unit.status"
                    />
                  </template>

                  <!-- 有内容的迭代：显示思考面板和工具列表 -->
                  <template v-else>
                    <div class="paper-chat-react-steps__phase-meta">
                      <span class="paper-chat-react-steps__phase-label">{{
                        getPhaseLabel(unit)
                      }}</span>
                      <span
                        v-if="unit.toolItems.length > 0"
                        class="paper-chat-react-steps__phase-count"
                      >
                        {{ unit.toolItems.length }} 次工具调用
                      </span>
                      <span
                        v-if="unit.isActive && isStreaming"
                        class="paper-chat-react-steps__phase-streaming"
                      >
                        <span class="paper-chat-react-steps__pulse-dot--small"></span>
                        实时更新中
                      </span>
                    </div>

                    <div
                      v-if="unit.reasoning"
                      class="paper-chat-react-steps__reasoning"
                      :class="{ expanded: isReasoningExpanded(unit) }"
                    >
                      <button
                        class="paper-chat-react-steps__reasoning-header"
                        type="button"
                        :aria-expanded="isReasoningExpanded(unit)"
                        @click="toggleReasoning(unit.key)"
                      >
                        <div class="paper-chat-react-steps__reasoning-header-left">
                          <SvgIcon
                            name="info"
                            class="paper-chat-react-steps__reasoning-icon"
                            :size="16"
                          />
                          <span class="paper-chat-react-steps__reasoning-label">思考</span>
                        </div>

                        <span
                          class="paper-chat-react-steps__reasoning-arrow"
                          :class="{ expanded: isReasoningExpanded(unit) }"
                          >▶</span
                        >
                      </button>

                      <div
                        class="paper-chat-react-steps__reasoning-body"
                        :class="{ expanded: isReasoningExpanded(unit) }"
                      >
                        <div class="paper-chat-react-steps__reasoning-content">
                          <!-- markdown-it 已禁用原生 HTML，这里仅渲染受控 Markdown -->
                          <!-- eslint-disable vue/no-v-html -->
                          <div
                            class="paper-chat-react-steps__reasoning-text markdown-body"
                            v-html="renderMarkdown(unit.reasoning)"
                          ></div>
                          <!-- eslint-enable vue/no-v-html -->
                        </div>
                      </div>
                    </div>

                    <div v-if="unit.toolItems.length > 0" class="paper-chat-react-steps__tool-list">
                      <TransitionGroup
                        name="paper-chat-react-tool"
                        tag="div"
                        class="paper-chat-react-steps__tool-list-inner"
                      >
                        <PaperChatToolCallPanel
                          v-for="(item, index) in unit.toolItems"
                          :key="item.id"
                          :tool-call="item"
                          :index="index"
                        />
                      </TransitionGroup>
                    </div>

                    <!-- 阶段内的文本内容 -->
                    <div
                      v-if="unit.stepContent"
                      class="paper-chat-react-steps__step-content"
                      :class="`is-${unit.stepContent.tone}`"
                    >
                      <!-- eslint-disable vue/no-v-html -->
                      <div
                        class="paper-chat-react-steps__step-content-text markdown-body"
                        v-html="renderMarkdown(unit.stepContent.content)"
                      ></div>
                      <!-- eslint-enable vue/no-v-html -->
                    </div>
                  </template>
                </div>
              </section>
            </TransitionGroup>
          </div>
        </template>

        <template v-else>
          <div class="paper-chat-react-steps__legacy-timeline">
            <TransitionGroup
              name="paper-chat-react-tool"
              tag="div"
              class="paper-chat-react-steps__tool-list-inner"
            >
              <PaperChatToolCallPanel
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
.paper-chat-react-steps {
  margin: 0;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  overflow: hidden;
}

.paper-chat-react-steps__header {
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

.paper-chat-react-steps__header:hover {
  background: var(--sm-color-surface-hover);
}

.paper-chat-react-steps__header-left {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
  flex-wrap: wrap;
}

.paper-chat-react-steps__header-right {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.paper-chat-react-steps__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-chat-react-steps__badge {
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

.paper-chat-react-steps__streaming-indicator,
.paper-chat-react-steps__phase-streaming {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.paper-chat-react-steps__pulse-dot,
.paper-chat-react-steps__pulse-dot--small {
  border-radius: 50%;
  background: var(--sm-color-accent);
  animation: pulse 1.8s infinite;
}

.paper-chat-react-steps__pulse-dot {
  width: 6px;
  height: 6px;
}

.paper-chat-react-steps__pulse-dot--small {
  width: 5px;
  height: 5px;
}

.paper-chat-react-steps__stat-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.paper-chat-react-steps__stat-badge.success {
  border-color: rgba(127, 176, 138, 0.24);
  background: rgba(127, 176, 138, 0.08);
  color: var(--sm-color-status-success);
}

.paper-chat-react-steps__stat-badge.error {
  border-color: rgba(199, 120, 120, 0.24);
  background: rgba(199, 120, 120, 0.08);
  color: var(--sm-color-status-danger);
}

.paper-chat-react-steps__expand-icon {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.paper-chat-react-steps__expand-icon.expanded {
  transform: rotate(90deg);
}

.paper-chat-react-steps__content {
  border-top: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-react-steps__phase-timeline,
.paper-chat-react-steps__legacy-timeline {
  padding: 14px;
}

/* 任务分组 */
.paper-chat-react-steps__task-group {
  position: relative;
}

.paper-chat-react-steps__task-group + .paper-chat-react-steps__task-group {
  margin-top: 8px;
}

.paper-chat-react-steps__task-divider {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  padding-bottom: 10px;
}

.paper-chat-react-steps__task-divider::before,
.paper-chat-react-steps__task-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--sm-color-border-subtle);
}

.paper-chat-react-steps__task-divider-label {
  flex-shrink: 0;
  padding: 2px 10px;
  border: 1px solid var(--sm-color-accent-22);
  border-radius: 999px;
  background: var(--sm-color-accent-08);
  color: var(--sm-color-accent-hover);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.paper-chat-react-steps__phase {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
}

.paper-chat-react-steps__phase:last-child {
  padding-bottom: 0;
}

.paper-chat-react-steps__phase-rail {
  position: relative;
  width: 14px;
  flex-shrink: 0;
}

.paper-chat-react-steps__phase-rail::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 14px;
  bottom: -16px;
  width: 2px;
  background: var(--sm-color-border-default);
}

.paper-chat-react-steps__phase:last-child .paper-chat-react-steps__phase-rail::after {
  display: none;
}

.paper-chat-react-steps__phase-node {
  position: relative;
  z-index: 1;
  display: block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--sm-color-border-strong);
  border-radius: 50%;
  background: var(--sm-color-surface-1);
}

.paper-chat-react-steps__phase-node.active {
  border-color: var(--sm-color-accent);
  background: var(--sm-color-accent-12);
}

.paper-chat-react-steps__phase-main {
  flex: 1;
  min-width: 0;
}

.paper-chat-react-steps__phase-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-bottom: 8px;
}

.paper-chat-react-steps__phase-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sm-color-text-secondary);
  letter-spacing: 0.02em;
}

.paper-chat-react-steps__phase-count {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
}

.paper-chat-react-steps__reasoning {
  contain: content;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  overflow: hidden;
}

.paper-chat-react-steps__reasoning.expanded {
  border-color: var(--sm-color-accent-28);
}

.paper-chat-react-steps__reasoning-header {
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

.paper-chat-react-steps__reasoning-header:hover {
  background: var(--sm-color-surface-hover);
}

.paper-chat-react-steps__reasoning-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.paper-chat-react-steps__reasoning-icon {
  width: 16px;
  height: 16px;
  color: var(--sm-color-accent-hover);
}

.paper-chat-react-steps__reasoning-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-chat-react-steps__reasoning-arrow {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.paper-chat-react-steps__reasoning-arrow.expanded {
  transform: rotate(90deg);
}

.paper-chat-react-steps__reasoning-body {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 180ms ease,
    opacity 140ms ease;
}

.paper-chat-react-steps__reasoning-body.expanded {
  max-height: 420px;
  opacity: 1;
}

.paper-chat-react-steps__reasoning-content {
  padding: 0 12px 12px;
  max-height: 400px;
  overflow-y: scroll;
  border-top: 1px solid var(--sm-color-border-subtle);
  overscroll-behavior: contain;
}

.paper-chat-react-steps__reasoning-text {
  contain: layout style;
  font-size: 12px;
  line-height: 1.55;
  color: var(--sm-color-text-secondary);
}

.paper-chat-react-steps__tool-list {
  margin-top: 12px;
}

.paper-chat-react-steps__plan-summary {
  padding: 12px 14px;
  border-top: 1px solid var(--sm-color-border-default);
}

.paper-chat-react-steps__plan-summary-divider {
  margin-bottom: 10px;
}

.paper-chat-react-steps__plan-summary-divider-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sm-color-accent-hover);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.paper-chat-react-steps__plan-summary-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
}

.paper-chat-react-steps__step-content {
  margin-top: 10px;
  padding: 10px 14px;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
}

.paper-chat-react-steps__step-content.is-error {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

.paper-chat-react-steps__step-content-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
}

.paper-chat-react-steps__step-content-text.markdown-body :deep(p) {
  margin: 0 0 0.5em;
}

.paper-chat-react-steps__step-content-text.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.paper-chat-react-steps__step-content-text.markdown-body :deep(code) {
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-accent-hover);
  font-size: 0.92em;
}

.paper-chat-react-steps__step-content-text.markdown-body :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  border-radius: var(--sm-radius-md);
  overflow-x: auto;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-react-steps__step-content-text.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--sm-color-text-secondary);
}

.paper-chat-react-steps__step-content-text.markdown-body :deep(ul),
.paper-chat-react-steps__step-content-text.markdown-body :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}

.paper-chat-react-steps__tool-list-inner :deep(.paper-chat-tool-call) {
  margin: 0 0 8px;
}

.paper-chat-react-steps__tool-list-inner :deep(.paper-chat-tool-call:last-child) {
  margin-bottom: 0;
}

.paper-chat-react-expand-enter-active {
  animation: expandIn 160ms ease;
}

.paper-chat-react-expand-leave-active {
  animation: expandOut 140ms ease;
}

.paper-chat-react-tool-enter-active,
.paper-chat-react-phase-enter-active {
  animation: itemIn 160ms ease;
}

.paper-chat-react-tool-move,
.paper-chat-react-phase-move {
  transition: transform 160ms ease;
}

.paper-chat-react-tool-leave-active,
.paper-chat-react-phase-leave-active {
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

.paper-chat-react-steps__reasoning-content::-webkit-scrollbar,
.paper-chat-react-steps__content::-webkit-scrollbar {
  width: 4px;
}

.paper-chat-react-steps__reasoning-content::-webkit-scrollbar-thumb,
.paper-chat-react-steps__content::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.paper-chat-react-steps__reasoning-text.markdown-body :deep(p) {
  margin: 0 0 0.5em;
}

.paper-chat-react-steps__reasoning-text.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.paper-chat-react-steps__reasoning-text.markdown-body :deep(code) {
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-accent-hover);
  font-size: 0.92em;
}

.paper-chat-react-steps__reasoning-text.markdown-body :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  border-radius: var(--sm-radius-md);
  overflow-x: auto;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-react-steps__reasoning-text.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--sm-color-text-secondary);
}

.paper-chat-react-steps__reasoning-text.markdown-body :deep(ul),
.paper-chat-react-steps__reasoning-text.markdown-body :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}

@media (max-width: 768px) {
  .paper-chat-react-steps__header {
    padding: 10px 12px;
  }

  .paper-chat-react-steps__phase {
    gap: 10px;
  }

  .paper-chat-react-steps__phase-meta {
    gap: 6px;
  }
}
</style>
