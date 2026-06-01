import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

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
      <SvgIcon name="chat" size={12} />
    </button>
  )
}
