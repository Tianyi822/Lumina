import type { ReactNode } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './AssistantPanelShell.module.css'

export interface AssistantPanelShellProps {
  title: string
  subtitle?: string
  status?: string
  loading?: boolean
  onClear: () => void
  onClose: () => void
  messages: ReactNode
  composer: ReactNode
}

/**
 * 通用 AI 面板外壳：只负责 header、status、消息视口与 composer 插槽。
 * 论文/写作面板各自保留业务 hook、Store 与文案。
 */
export default function AssistantPanelShell({
  title,
  subtitle,
  status,
  loading,
  onClear,
  onClose,
  messages,
  composer
}: AssistantPanelShellProps) {
  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h2>{title}</h2>
          {subtitle ? <span title={subtitle}>{subtitle}</span> : null}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.iconButton}
            type="button"
            title="清空上下文"
            aria-label="清空上下文"
            disabled={loading}
            onClick={onClear}
          >
            <SvgIcon name="trash" size={15} />
          </button>
          <button
            className={styles.iconButton}
            type="button"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <SvgIcon name="close" size={16} />
          </button>
        </div>
      </header>

      {status ? (
        <div className={styles.statusBar} role="status">
          {status}
        </div>
      ) : null}

      {loading ? (
        <div className={styles.loadingState}>正在加载对话...</div>
      ) : (
        <div className={styles.messages}>{messages}</div>
      )}

      <div className={styles.composerSlot}>{composer}</div>
    </section>
  )
}
