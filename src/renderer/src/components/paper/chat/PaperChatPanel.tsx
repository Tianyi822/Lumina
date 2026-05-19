import { useState, useCallback } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotification } from '@renderer/composables/useNotification'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { PaperDocument } from '@shared/types/paper'
import styles from './PaperChatPanel.module.css'

interface PaperChatPanelProps {
  paper: PaperDocument
}

/**
 * 论文聊天面板 — Phase 8c
 *
 * 已实现：面板壳层（标题栏 / 关闭 / 清空上下文 / 输入区 / 消息区）
 * 待移植 usePaperChatSession / usePaperChatStream composable 后完善发送和消息展示。
 */
export default function PaperChatPanel({ paper }: PaperChatPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const notify = useNotification()

  const setPaperChatPanelOpen = useUIStateStore((s) => s.setPaperChatPanelOpen)

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setInputValue('')
    // 完整发送流程需要 usePaperChatSession + usePaperChatStream composable 的 React 移植
    window.api.logger.info('[PaperChatPanel] 发送消息（composable 移植后完整实现）', {
      paperId: paper.id,
      messageLength: text.length
    })
  }, [inputValue, paper.id])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleClearContext = useCallback(async () => {
    const confirmed = await notify.confirm('聊天记录会被清空。', {
      title: '清空当前论文聊天上下文？',
      danger: true
    })
    if (!confirmed) return
    // 完整清空流程需要 composable 移植
  }, [notify])

  return (
    <section className={styles['paper-chat-panel']}>
      <header className={styles['paper-chat-panel__header']}>
        <div className={styles['paper-chat-panel__title-group']}>
          <h2>论文对话</h2>
          <span title={paper.fileName}>{paper.fileName}</span>
        </div>

        <div className={styles['paper-chat-panel__actions']}>
          <button
            className={styles['paper-chat-panel__icon-button']}
            type="button"
            title="清空上下文"
            aria-label="清空上下文"
            onClick={handleClearContext}
          >
            <SvgIcon name="trash" size={15} />
          </button>
          <button
            className={styles['paper-chat-panel__icon-button']}
            type="button"
            title="关闭"
            aria-label="关闭"
            onClick={() => setPaperChatPanelOpen(false)}
          >
            <SvgIcon name="close" size={16} />
          </button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            color: 'var(--sm-color-text-secondary)',
            fontSize: '13px',
            textAlign: 'center'
          }}
        >
          聊天消息区 — 等待 usePaperChatSession / usePaperChatStream composable 移植
        </div>
      </div>

      <div className={styles['paper-chat-panel__composer']}>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 12px',
            borderTop: '1px solid var(--sm-color-border-default)'
          }}
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="sm-input"
            placeholder="输入命令或消息，Shift+Enter 换行..."
            rows={2}
            style={{
              flex: 1,
              resize: 'none',
              fontFamily: 'inherit',
              fontSize: '13px'
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              className="sm-button sm-button--primary"
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
