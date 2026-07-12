import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

/** 论文聊天按钮，点击切换 AI 对话侧栏的显示 */
interface PaperChatButtonProps {
  isActive: boolean
  onClick: () => void
}

export default function PaperChatButton({ isActive, onClick }: PaperChatButtonProps) {
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
        aria-label="会话"
        type="button"
        onClick={onClick}
      >
        <SvgIcon name="chat" size={18} />
      </button>
      <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
        会话
      </span>
    </div>
  )
}
