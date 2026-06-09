import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

/** 论文聊天按钮，点击切换 AI 对话侧栏的显示 */
interface PaperChatButtonProps {
  isActive: boolean
  onClick: () => void
}

export default function PaperChatButton({ isActive, onClick }: PaperChatButtonProps) {
  return (
    <button
      className={[
        'sm-icon-button',
        styles['sm-workspace-toolbar__button'],
        isActive && styles['is-active']
      ]
        .filter(Boolean)
        .join(' ')}
      title="聊天"
      aria-label="聊天"
      type="button"
      onClick={onClick}
    >
      <SvgIcon name="chat" size={18} />
    </button>
  )
}
