import { useMemo, useState, type FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserInteractionOption, UserInteractionRequest } from '@shared/types/chat'
import { renderInline, renderBlock } from './markdownRender'
import styles from './UserInteractionList.module.css'

// 显式引入 LaTeX 渲染所需样式（spec §6.2），bundler 自动去重
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'

/** UserInteractionList 受控组件的 props */
export interface UserInteractionListProps {
  /** 用户交互请求（含 question 与 options） */
  interaction: UserInteractionRequest
  /** 选项点击回调，返回完整选项（父组件按 spec §6.5 优先回填 value） */
  onSelect: (option: UserInteractionOption) => void
  /** "稍后"按钮回调 */
  onLater?: () => void
  /** 首屏可见选项数，超过则折叠并显示"展开更多"；默认 4 */
  initialVisibleCount?: number
}

/**
 * 用户交互选项纵向列表组件
 * question 块级渲染（含 LaTeX 公式块），option label/description 行内渲染
 */
export const UserInteractionList: FC<UserInteractionListProps> = ({
  interaction,
  onSelect,
  onLater,
  initialVisibleCount = 4
}) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // 预渲染 question（块级，含 $$...$$ 与 \begin{equation}）
  const questionHtml = useMemo(() => renderBlock(interaction.question), [interaction.question])

  const visibleOptions = useMemo(() => {
    if (expanded || interaction.options.length <= initialVisibleCount) {
      return interaction.options
    }
    return interaction.options.slice(0, initialVisibleCount)
  }, [interaction.options, expanded, initialVisibleCount])

  const hasMore = !expanded && interaction.options.length > initialVisibleCount

  return (
    <div className={styles.interactionCard}>
      <div className={styles.questionRow}>
        <div className={styles.question} dangerouslySetInnerHTML={{ __html: questionHtml }} />
        {onLater && (
          <button type="button" className={styles.laterButton} onClick={onLater}>
            {t('paper.chat.interaction.later')}
          </button>
        )}
      </div>

      <div className={styles.optionList}>
        {visibleOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.optionItem}
            onClick={() => onSelect(option)}
          >
            <span
              className={styles.optionLabel}
              dangerouslySetInnerHTML={{ __html: renderInline(option.label) }}
            />
            {option.description && (
              <span
                className={styles.optionDesc}
                dangerouslySetInnerHTML={{ __html: renderInline(option.description) }}
              />
            )}
          </button>
        ))}
      </div>

      {hasMore && (
        <button type="button" className={styles.expandMore} onClick={() => setExpanded(true)}>
          {t('paper.chat.interaction.expandMore', { count: interaction.options.length })}
        </button>
      )}
    </div>
  )
}
