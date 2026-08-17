import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MarkdownIt from 'markdown-it'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { estimateTokenCount, formatTokenCount } from '@renderer/utils/tokenEstimate'
import styles from './PaperChatReasoningPanel.module.css'

interface PaperChatReasoningPanelProps {
  content: string
  isExpanded?: boolean
  reasoningTokens?: number
  onToggle?: () => void
}

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
})

/** 使用 markdown-it 将推理内容渲染为 HTML */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

/** AI 推理过程可折叠面板组件，展示模型思考过程和 token 消耗 */
export default function PaperChatReasoningPanel({
  content,
  isExpanded,
  reasoningTokens,
  onToggle
}: PaperChatReasoningPanelProps) {
  const { t } = useTranslation()
  const [localExpanded, setLocalExpanded] = useState(isExpanded ?? false)
  const actuallyExpanded = isExpanded ?? localExpanded
  const renderedMarkdown = useMemo(() => renderMarkdown(content), [content])
  const tokenLabel = useMemo(() => {
    if (reasoningTokens !== undefined) {
      return formatTokenCount(reasoningTokens)
    }
    return t('paper.chat.reasoning.tokens', {
      formatted: formatTokenCount(estimateTokenCount(content))
    })
  }, [content, reasoningTokens, t])

  function toggle(): void {
    if (isExpanded === undefined) {
      setLocalExpanded((value) => !value)
    }
    onToggle?.()
  }

  return (
    <div className={`${styles['reasoning-panel']} ${actuallyExpanded ? styles.expanded : ''}`}>
      <button className={styles['sm-reasoning-panel__header']} type="button" onClick={toggle}>
        <span className={styles['header-left']}>
          <span className={styles['header-icon']}>
            <SvgIcon name="thinking" size={20} />
          </span>
          <span className={styles['header-text']}>
            <span className={styles['header-label']}>{t('paper.chat.reasoning.title')}</span>
            <span className={styles['header-meta']}>{tokenLabel}</span>
          </span>
        </span>
        <span className={styles['header-right']}>
          <span className={`${styles['expand-arrow']} ${actuallyExpanded ? styles.rotated : ''}`}>
            <SvgIcon name="arrow-down" size={16} />
          </span>
        </span>
      </button>

      <div
        className={`${styles['sm-reasoning-panel__content-shell']} ${
          actuallyExpanded ? styles.expanded : ''
        }`}
      >
        <div className={styles['sm-reasoning-panel__content']}>
          <div
            className={`${styles['reasoning-text']} markdown-body`}
            dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
          />
        </div>
      </div>
    </div>
  )
}
