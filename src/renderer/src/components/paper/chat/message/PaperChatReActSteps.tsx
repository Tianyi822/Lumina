import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import MarkdownIt from 'markdown-it'
import type { ReActIteration, ReActStep, UiReactIterationStatus } from '@renderer/types'
import type { PaperChatStepContentResult } from './paperChatReactStepContent'
import { derivePaperChatStepContent } from './paperChatReactStepContent'
import PaperChatToolCallPanel, { type PaperChatToolCallPanelItem } from './PaperChatToolCallPanel'
import '@renderer/styles/paperChatReactSteps.css'

interface PaperChatReActStepsProps {
  steps?: ReActStep[]
  iterations?: ReActIteration[]
  isStreaming?: boolean
}

interface PhaseUnit {
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

interface TaskGroup {
  taskNumber: number
  units: PhaseUnit[]
}

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: true })

/** 使用 markdown-it 将文本渲染为 HTML */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

/** 将 ReAct 步骤（tool_call/tool_result）转换为工具调用面板项的列表 */
function stepsToToolCallItems(
  steps: ReActStep[],
  isStreaming?: boolean
): PaperChatToolCallPanelItem[] {
  const items: PaperChatToolCallPanelItem[] = []
  const pendingCalls = new Map<string, { index: number }>()

  // 遍历步骤序列：tool_call 创建待处理项，tool_result 对应回填结果
  steps.forEach((step, index) => {
    if (step.type === 'tool_call' && step.toolCall) {
      // 记录 tool_call ID 到待处理映射，流式末尾项标记为 running
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
      // 根据 tool_call ID 匹配并回填工具执行结果
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

/** 如果后续已有最终内容，则移除推理文本末尾的结论承诺语句 */
// 若后续已有最终内容，移除推理末尾的结论承诺语句（避免文字冗余）
function trimConclusionPromise(reasoning: string, content?: string): string {
  if (content?.trim()) return reasoning
  return reasoning.replace(/[\s]*现在可以给出步骤结论[。\s]*$/, '').trimEnd()
}

/** 根据任务分组信息生成阶段的显示标签（如"阶段 1.2"） */
// 根据 taskNumber 生成阶段标签
function getPhaseLabel(
  unit: PhaseUnit,
  taskGroups: TaskGroup[],
  hasTaskGroups: boolean,
  t: TFunction
): string {
  if (unit.taskNumber !== undefined) {
    const group = taskGroups.find((item) => item.taskNumber === unit.taskNumber)
    const localIndex = group ? group.units.indexOf(unit) + 1 : unit.iteration + 1
    return t('paper.chat.phaseLabel', {
      number: `${unit.taskNumber}.${localIndex > 0 ? localIndex : unit.iteration + 1}`
    })
  }
  if (!hasTaskGroups) {
    return t('paper.chat.iterationPhase', { number: unit.iteration + 1 })
  }
  return t('paper.chat.phaseLabel', { number: unit.iteration + 1 })
}

function PhaseUnitView({
  unit,
  phaseLabel,
  isStreaming,
  reasoningExpanded,
  onToggleReasoning
}: {
  unit: PhaseUnit
  phaseLabel: string
  isStreaming?: boolean
  reasoningExpanded: boolean
  onToggleReasoning: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="paper-chat-react-steps__phase">
      <span className="paper-chat-react-steps__phase-rail" aria-hidden="true">
        <span className={`paper-chat-react-steps__phase-node ${unit.isActive ? 'active' : ''}`} />
      </span>
      <div className="paper-chat-react-steps__phase-main">
        <div className="paper-chat-react-steps__phase-meta">
          <span className="paper-chat-react-steps__phase-label">{phaseLabel}</span>
          {unit.toolItems.length > 0 && (
            <span className="paper-chat-react-steps__phase-count">
              {t('paper.chat.react.toolCalls', { count: unit.toolItems.length })}
            </span>
          )}
          {isStreaming && unit.isActive && (
            <span className="paper-chat-react-steps__phase-streaming">
              <span className="paper-chat-react-steps__pulse-dot--small" />
              {t('paper.chat.react.inProgress')}
            </span>
          )}
        </div>

        {unit.reasoning.trim().length > 0 && (
          <div
            className={`paper-chat-react-steps__reasoning ${reasoningExpanded ? 'expanded' : ''}`}
          >
            <button
              className="paper-chat-react-steps__reasoning-header"
              type="button"
              onClick={onToggleReasoning}
            >
              <span className="paper-chat-react-steps__reasoning-header-left">
                <span className="paper-chat-react-steps__reasoning-label">
                  {t('paper.chat.react.phaseThinking')}
                </span>
              </span>
              <span
                className={`paper-chat-react-steps__reasoning-arrow ${
                  reasoningExpanded ? 'expanded' : ''
                }`}
              >
                ▶
              </span>
            </button>
            <div
              className={`paper-chat-react-steps__reasoning-body ${
                reasoningExpanded ? 'expanded' : ''
              }`}
            >
              <div className="paper-chat-react-steps__reasoning-content">
                <div
                  className="paper-chat-react-steps__reasoning-text markdown-body"
                  dangerouslySetInnerHTML={{ __html: unit.reasoningHtml }}
                />
              </div>
            </div>
          </div>
        )}

        {unit.toolItems.length > 0 && (
          <div className="paper-chat-react-steps__tool-list">
            <div className="paper-chat-react-steps__tool-list-inner">
              {unit.toolItems.map((item, index) => (
                <PaperChatToolCallPanel key={item.id} toolCall={item} index={index} />
              ))}
            </div>
          </div>
        )}

        {unit.stepContent && (
          <div
            className={`paper-chat-react-steps__step-content ${
              unit.stepContent.tone === 'error' ? 'is-error' : ''
            }`}
          >
            <div
              className="paper-chat-react-steps__step-content-text markdown-body"
              dangerouslySetInnerHTML={{ __html: unit.stepContentHtml || '' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** ReAct 分阶段推理展示组件，支持迭代模式（阶段时间线）和传统模式（工具调用列表） */
export default function PaperChatReActSteps({
  steps,
  iterations,
  isStreaming
}: PaperChatReActStepsProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedReasoningKeys, setExpandedReasoningKeys] = useState<Set<string>>(new Set())

  // 判断是否有活跃迭代包含有效内容，决定是否使用阶段时间线模式
  const useIterationMode = useMemo(
    () =>
      iterations?.some(
        (iteration) =>
          iteration.isActive ||
          iteration.reasoning.trim().length > 0 ||
          iteration.steps.length > 0 ||
          (iteration.content?.trim().length ?? 0) > 0
      ) || false,
    [iterations]
  )

  const legacyToolItems = useMemo(
    () => stepsToToolCallItems(steps || [], isStreaming),
    [steps, isStreaming]
  )

  // 将迭代数据转换为阶段单元列表
  const phaseUnits = useMemo<PhaseUnit[]>(() => {
    return (iterations || [])
      .map((iteration) => {
        const toolItems = stepsToToolCallItems(iteration.steps, isStreaming && !!iteration.isActive)
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
  }, [iterations, isStreaming])

  const hasTaskGroups = useMemo(
    () => phaseUnits.some((unit) => unit.taskNumber !== undefined),
    [phaseUnits]
  )

  // 将阶段单元按 taskNumber 分组
  const taskGroups = useMemo<TaskGroup[]>(() => {
    if (!hasTaskGroups) return []
    const groups: TaskGroup[] = []
    for (const unit of phaseUnits) {
      const taskNumber = unit.taskNumber ?? 0
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.taskNumber === taskNumber) {
        lastGroup.units.push(unit)
      } else {
        groups.push({ taskNumber, units: [unit] })
      }
    }
    return groups
  }, [hasTaskGroups, phaseUnits])

  const hasContent = useIterationMode ? phaseUnits.length > 0 : legacyToolItems.length > 0
  const toolItems = useIterationMode
    ? phaseUnits.flatMap((unit) => unit.toolItems)
    : legacyToolItems
  // 统计工具调用成功/失败次数
  const toolStats = {
    success: toolItems.filter((item) => item.status === 'success').length,
    failed: toolItems.filter((item) => item.status === 'error').length
  }

  // 流式响应时自动展开面板，并展开活跃阶段的思考区域
  useEffect(() => {
    if (isStreaming || phaseUnits.length > 0) {
      setIsExpanded(true)
    }

    setExpandedReasoningKeys((current) => {
      const next = new Set(current)
      for (const unit of phaseUnits) {
        if (unit.isActive && unit.reasoning.trim().length > 0) {
          next.add(unit.key)
        }
      }
      return next
    })
  }, [isStreaming, phaseUnits])

  function toggleReasoning(unitKey: string): void {
    setExpandedReasoningKeys((current) => {
      const next = new Set(current)
      if (next.has(unitKey)) {
        next.delete(unitKey)
      } else {
        next.add(unitKey)
      }
      return next
    })
  }

  if (!hasContent) {
    return null
  }

  return (
    <div className="paper-chat-react-steps">
      <button
        className="paper-chat-react-steps__header"
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((value) => !value)}
      >
        <span className="paper-chat-react-steps__header-left">
          <span className="paper-chat-react-steps__title">{t('paper.chat.react.title')}</span>
          <span className="paper-chat-react-steps__badge">
            {t('paper.chat.react.toolCalls', { count: toolItems.length })}
          </span>
          {isStreaming && (
            <span className="paper-chat-react-steps__streaming-indicator">
              <span className="paper-chat-react-steps__pulse-dot" />
              {t('paper.chat.react.inProgress')}
            </span>
          )}
        </span>
        <span className="paper-chat-react-steps__header-right">
          {toolStats.success > 0 && (
            <span className="paper-chat-react-steps__stat-badge success">
              ✓ {toolStats.success}
            </span>
          )}
          {toolStats.failed > 0 && (
            <span className="paper-chat-react-steps__stat-badge error">! {toolStats.failed}</span>
          )}
          <span className={`paper-chat-react-steps__expand-icon ${isExpanded ? 'expanded' : ''}`}>
            ▶
          </span>
        </span>
      </button>

      {isExpanded && (
        <div className="paper-chat-react-steps__content">
          {useIterationMode ? (
            hasTaskGroups ? (
              <div className="paper-chat-react-steps__phase-timeline">
                {taskGroups.map((group) => (
                  <div
                    key={`task-${group.taskNumber}`}
                    className="paper-chat-react-steps__task-group"
                  >
                    <div className="paper-chat-react-steps__task-divider">
                      <span className="paper-chat-react-steps__task-divider-label">
                        {t('paper.chat.taskLabel', { index: group.taskNumber })}
                      </span>
                    </div>
                    {group.units.map((unit) => (
                      <PhaseUnitView
                        key={unit.key}
                        unit={unit}
                        phaseLabel={getPhaseLabel(unit, taskGroups, hasTaskGroups, t)}
                        isStreaming={isStreaming}
                        reasoningExpanded={expandedReasoningKeys.has(unit.key)}
                        onToggleReasoning={() => toggleReasoning(unit.key)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="paper-chat-react-steps__phase-timeline">
                {phaseUnits.map((unit) => (
                  <PhaseUnitView
                    key={unit.key}
                    unit={unit}
                    phaseLabel={getPhaseLabel(unit, taskGroups, hasTaskGroups, t)}
                    isStreaming={isStreaming}
                    reasoningExpanded={expandedReasoningKeys.has(unit.key)}
                    onToggleReasoning={() => toggleReasoning(unit.key)}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="paper-chat-react-steps__legacy-timeline">
              <div className="paper-chat-react-steps__tool-list-inner">
                {legacyToolItems.map((item, index) => (
                  <PaperChatToolCallPanel key={item.id} toolCall={item} index={index} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
