import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import type { PaperChatPlanState } from '@renderer/stores/paperChatStreamStore'
import PlanningStatusIndicator from './PlanningStatusIndicator'
import styles from './PaperChatPlanDock.module.css'

interface PaperChatPlanDockProps {
  planState: PaperChatPlanState | null
}

/** 计划状态文案 key（paper.chat.plan.status*） */
const PLAN_STATUS_KEYS: Record<string, ParseKeys> = {
  planning: 'paper.chat.plan.statusPlanning',
  planned: 'paper.chat.plan.statusPlanned',
  running: 'paper.chat.plan.statusRunning',
  completed: 'paper.chat.plan.statusCompleted',
  failed: 'paper.chat.plan.statusFailed',
  cancelled: 'paper.chat.plan.statusCancelled'
}
const PLAN_STATUS_DEFAULT_KEY: ParseKeys = 'paper.chat.plan.statusIdle'

/** 步骤状态文案 key（paper.chat.plan.step*） */
const STEP_STATUS_KEYS: Record<string, ParseKeys> = {
  running: 'paper.chat.plan.stepRunning',
  success: 'paper.chat.plan.stepSuccess',
  failed: 'paper.chat.plan.stepFailed',
  cancelled: 'paper.chat.plan.stepCancelled',
  skipped: 'paper.chat.plan.stepSkipped'
}
const STEP_STATUS_DEFAULT_KEY: ParseKeys = 'paper.chat.plan.stepWaiting'

/** 迭代（子阶段）状态文案 key（paper.chat.plan.iteration*） */
const ITERATION_STATUS_KEYS: Record<string, ParseKeys> = {
  calling_tools: 'paper.chat.plan.iterationCallingTools',
  processing: 'paper.chat.plan.iterationProcessing',
  complete: 'paper.chat.plan.iterationComplete'
}
const ITERATION_STATUS_DEFAULT_KEY: ParseKeys = 'paper.chat.plan.iterationThinking'

/** 论文对话 Plan-Execute 执行计划的停靠面板，展示多步骤任务的进度和各阶段状态 */
export default function PaperChatPlanDock({ planState }: PaperChatPlanDockProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const summary = useMemo(() => {
    if (!planState) return t('paper.chat.plan.summaryWaiting')
    return (
      planState.summary ||
      planState.error ||
      t('paper.chat.plan.stepCount', { count: planState.steps.length })
    )
  }, [planState, t])

  if (!planState) {
    return null
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
            {t(PLAN_STATUS_KEYS[planState.status] ?? PLAN_STATUS_DEFAULT_KEY)}
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
              <PlanningStatusIndicator text={t('paper.chat.plan.planningIndicator')} />
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
                        {t('paper.chat.taskLabel', { index: index + 1 })}
                      </span>
                      <span className={styles['paper-chat-plan-dock__task-state']}>
                        {t(STEP_STATUS_KEYS[step.status] ?? STEP_STATUS_DEFAULT_KEY)}
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
                              {t('paper.chat.phaseLabel', {
                                number: `${iteration.stepNumber}.${iteration.localPhaseNumber}`
                              })}
                            </span>
                            <span className={styles['paper-chat-plan-dock__phase-state']}>
                              {t(
                                ITERATION_STATUS_KEYS[iteration.status] ??
                                  ITERATION_STATUS_DEFAULT_KEY
                              )}
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
