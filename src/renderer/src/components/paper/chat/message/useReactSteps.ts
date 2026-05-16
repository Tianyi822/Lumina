import MarkdownIt from 'markdown-it'
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ReActIteration, ReActStep, UiReactIterationStatus } from '@renderer/types'
import type { PaperChatToolCallPanelItem } from './PaperChatToolCallPanel.vue'
import type { PaperChatStepContentResult } from './paperChatReactStepContent'
import { derivePaperChatStepContent } from './paperChatReactStepContent'

export interface PhaseUnit {
  key: string
  iteration: number
  reasoning: string
  reasoningHtml: string
  toolItems: PaperChatToolCallPanelItem[]
  isActive: boolean
  status?: UiReactIterationStatus
  content?: string
  stepContent?: PaperChatStepContentResult | null
  stepContentHtml?: string
  taskNumber?: number
}

export interface TaskGroup {
  taskNumber: number
  units: PhaseUnit[]
}

export interface UseReactStepsReturn {
  isExpanded: Ref<boolean>
  hasContent: ComputedRef<boolean>
  useIterationMode: ComputedRef<boolean>
  toolCount: ComputedRef<number>
  toolStats: ComputedRef<{ success: number; failed: number }>
  legacyToolItems: ComputedRef<PaperChatToolCallPanelItem[]>
  phaseUnits: ComputedRef<PhaseUnit[]>
  hasTaskGroups: ComputedRef<boolean>
  taskGroups: ComputedRef<TaskGroup[]>
  toggleExpand: () => void
  toggleReasoning: (unitKey: string) => void
  isReasoningExpanded: (unit: PhaseUnit) => boolean
  getPhaseLabel: (unit: PhaseUnit) => string
}

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: true })

export function useReactSteps(options: {
  steps: ComputedRef<ReActStep[] | undefined>
  iterations: ComputedRef<ReActIteration[] | undefined>
  isStreaming: ComputedRef<boolean | undefined>
}): UseReactStepsReturn {
  const isExpanded = ref(false)
  const expandedReasoningSet = ref<Set<string>>(new Set())

  const useIterationMode = computed(() => {
    return (
      options.iterations.value?.some(
        (iteration) =>
          iteration.isActive ||
          iteration.reasoning.trim().length > 0 ||
          iteration.steps.length > 0 ||
          (iteration.content?.trim().length ?? 0) > 0
      ) || false
    )
  })

  const legacyToolItems = computed(() => {
    return stepsToToolCallItems(options.steps.value || [], options.isStreaming.value)
  })

  const phaseUnits = computed<PhaseUnit[]>(() => {
    return (options.iterations.value || [])
      .map((iteration) => {
        const toolItems = stepsToToolCallItems(
          iteration.steps,
          options.isStreaming.value && !!iteration.isActive
        )
        const reasoning = trimConclusionPromise(iteration.reasoning, iteration.content)
        const stepContent = derivePaperChatStepContent(toolItems, iteration.content)
        return {
          key: `iter-${iteration.iteration}`,
          iteration: iteration.iteration,
          reasoning,
          reasoningHtml: renderMarkdown(reasoning),
          toolItems,
          isActive: !!iteration.isActive,
          status: iteration.status,
          content: iteration.content,
          stepContent,
          stepContentHtml: stepContent ? renderMarkdown(stepContent.content) : undefined,
          taskNumber: iteration.taskNumber
        }
      })
      .filter(
        (unit) =>
          unit.isActive ||
          unit.reasoning.trim().length > 0 ||
          unit.toolItems.length > 0 ||
          !!unit.stepContent
      )
  })

  const hasTaskGroups = computed(() => {
    return phaseUnits.value.some((unit) => unit.taskNumber !== undefined)
  })

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

  const hasContent = computed(() => {
    if (useIterationMode.value) return phaseUnits.value.length > 0
    return legacyToolItems.value.length > 0
  })

  const toolCount = computed(() => {
    if (useIterationMode.value) {
      return phaseUnits.value.reduce((sum, unit) => sum + unit.toolItems.length, 0)
    }
    return legacyToolItems.value.length
  })

  const toolStats = computed(() => {
    const items = useIterationMode.value
      ? phaseUnits.value.flatMap((u) => u.toolItems)
      : legacyToolItems.value
    return {
      success: items.filter((item) => item.status === 'success').length,
      failed: items.filter((item) => item.status === 'error').length
    }
  })

  watch(
    options.isStreaming,
    (streaming, previousStreaming) => {
      if (streaming && !previousStreaming) isExpanded.value = true
    },
    { immediate: true }
  )

  watch(
    phaseUnits,
    (units) => {
      if (options.isStreaming.value && units.length > 0) isExpanded.value = true
      for (const unit of units) {
        if (unit.isActive && unit.reasoning.trim().length > 0) {
          expandedReasoningSet.value.add(unit.key)
        }
      }
    },
    { deep: true, immediate: true }
  )

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
        if (!pending) return

        const item = items[pending.index]
        if (!item) return

        item.status = step.toolResult.success ? 'success' : 'error'
        item.result = step.toolResult.result
        item.error = step.toolResult.error
        item.endTime = step.timestamp
        pendingCalls.delete(step.toolResult.id)
      }
    })

    return items
  }

  function trimConclusionPromise(reasoning: string, content?: string): string {
    if (content?.trim()) return reasoning
    return reasoning.replace(/[\s]*现在可以给出步骤结论[。\s]*$/, '').trimEnd()
  }

  function toggleExpand(): void {
    isExpanded.value = !isExpanded.value
  }

  function toggleReasoning(unitKey: string): void {
    if (expandedReasoningSet.value.has(unitKey)) {
      expandedReasoningSet.value.delete(unitKey)
    } else {
      expandedReasoningSet.value.add(unitKey)
    }
  }

  function isReasoningExpanded(unit: PhaseUnit): boolean {
    return expandedReasoningSet.value.has(unit.key)
  }

  function renderMarkdown(content: string): string {
    if (!content) return ''
    return md.render(content)
  }

  function getPhaseLabel(unit: PhaseUnit): string {
    if (unit.taskNumber !== undefined) {
      const localIndex = getLocalPhaseIndex(unit)
      return `阶段 ${unit.taskNumber}.${localIndex}`
    }
    return `第 ${unit.iteration + 1} 阶段`
  }

  function getLocalPhaseIndex(unit: PhaseUnit): number {
    if (!hasTaskGroups.value) return unit.iteration + 1
    const group = taskGroups.value.find((g) => g.taskNumber === unit.taskNumber)
    if (!group) return unit.iteration + 1
    const idx = group.units.indexOf(unit)
    return idx >= 0 ? idx + 1 : unit.iteration + 1
  }

  return {
    isExpanded,
    hasContent,
    useIterationMode,
    toolCount,
    toolStats,
    legacyToolItems,
    phaseUnits,
    hasTaskGroups,
    taskGroups,
    toggleExpand,
    toggleReasoning,
    isReasoningExpanded,
    getPhaseLabel
  }
}
