import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

interface WriterChatButtonProps {
  isActive: boolean
  disabled?: boolean
  onClick: () => void
}

/** 写作对话按钮，点击切换写作 AI 面板 */
export default function WriterChatButton({ isActive, disabled, onClick }: WriterChatButtonProps) {
  return (
    <div className={styles['sm-workspace-toolbar__item-wrap']}>
      <button
        className={[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          isActive && styles['is-active']
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="写作对话"
        type="button"
        disabled={disabled}
        onClick={onClick}
      >
        <SvgIcon name="chat" size={18} />
      </button>
      <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
        写作对话
      </span>
    </div>
  )
}
