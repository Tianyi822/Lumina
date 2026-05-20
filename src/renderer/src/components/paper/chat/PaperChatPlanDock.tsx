import { useMemo, useState } from 'react'
import type { PaperChatPlanState } from '@renderer/stores/paperChatStreamStore'
import PlanningStatusIndicator from './PlanningStatusIndicator'
import styles from './PaperChatPlanDock.module.css'

interface PaperChatPlanDockProps {
  planState: PaperChatPlanState | null
  sending?: boolean
}

function getStatusLabel(status: PaperChatPlanState['status']): string {
  if (status === 'planning') return '规划中'
  if (status === 'planned') return '已规划'
  if (status === 'running') return '执行中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  return '待命'
}

function getStepStatusLabel(status: string): string {
  if (status === 'running') return '运行'
  if (status === 'success') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '取消'
  if (status === 'skipped') return '跳过'
  return '等待'
}

function getIterationStatusLabel(status: string): string {
  if (status === 'calling_tools') return '调用工具'
  if (status === 'processing') return '处理结果'
  if (status === 'complete') return '完成'
  return '思考'
}

export default function PaperChatPlanDock({ planState, sending }: PaperChatPlanDockProps) {
  const [expanded, setExpanded] = useState(true)
  const visible = Boolean(planState || sending)
  const summary = useMemo(() => {
    if (!planState) return '等待模型生成执行计划'
    return planState.summary || planState.error || `${planState.steps.length} 个步骤`
  }, [planState])

  if (!visible) {
    return null
  }

  if (!planState) {
    return (
      <div className={styles['paper-chat-plan-dock']}>
        <div className={styles['paper-chat-plan-dock__waiting']}>
          <span className={styles['paper-chat-plan-dock__dot']} />
          <PlanningStatusIndicator text="正在准备实验室工具" />
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles['paper-chat-plan-dock']} ${styles[`is-${planState.status}`] || ''}`}>
      <button
        className={styles['paper-chat-plan-dock__header']}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles['paper-chat-plan-dock__header-main']}>
          <span className={styles['paper-chat-plan-dock__status-label']}>
            {getStatusLabel(planState.status)}
          </span>
          <span className={styles['paper-chat-plan-dock__summary']}>{summary}</span>
        </span>
        <span
          className={`${styles['paper-chat-plan-dock__chevron']} ${
            expanded ? styles['is-expanded'] : ''
          }`}
        >
          ▶
        </span>
      </button>

      {expanded && (
        <div className={styles['paper-chat-plan-dock__body']}>
          {planState.steps.length === 0 ? (
            <div className={styles['paper-chat-plan-dock__empty-status']}>
              <span className={styles['paper-chat-plan-dock__dot']} />
              <PlanningStatusIndicator text="正在拆解任务" />
            </div>
          ) : (
            <div className={styles['paper-chat-plan-dock__list']}>
              {planState.steps.map((step, index) => {
                const iterations = planState.stepIterations[index] || []
                return (
                  <div
                    key={`${step.index ?? index}-${step.title}`}
                    className={`${styles['paper-chat-plan-dock__task']} ${
                      styles[`is-${step.status}`] || ''
                    }`}
                  >
                    <div className={styles['paper-chat-plan-dock__task-row']}>
                      <span className={styles['paper-chat-plan-dock__task-number']}>
                        任务 {index + 1}
                      </span>
                      <span className={styles['paper-chat-plan-dock__task-state']}>
                        {getStepStatusLabel(step.status)}
                      </span>
                      <span className={styles['paper-chat-plan-dock__task-main']}>
                        <span className={styles['paper-chat-plan-dock__task-title']}>
                          {step.title}
                        </span>
                        {(step.summary || step.description || step.error) && (
                          <span className={styles['paper-chat-plan-dock__task-detail']}>
                            {step.error || step.summary || step.description}
                          </span>
                        )}
                      </span>
                    </div>

                    {iterations.length > 0 && (
                      <div className={styles['paper-chat-plan-dock__phases']}>
                        {iterations.map((iteration) => (
                          <div
                            key={`${iteration.stepNumber}-${iteration.localPhaseNumber}`}
                            className={`${styles['paper-chat-plan-dock__phase']} ${
                              styles[`is-${iteration.status}`] || ''
                            }`}
                          >
                            <span className={styles['paper-chat-plan-dock__phase-label']}>
                              阶段 {iteration.stepNumber}.{iteration.localPhaseNumber}
                            </span>
                            <span className={styles['paper-chat-plan-dock__phase-state']}>
                              {getIterationStatusLabel(iteration.status)}
                            </span>
                            {iteration.toolSummary && (
                              <span className={styles['paper-chat-plan-dock__phase-tools']}>
                                {iteration.toolSummary}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
