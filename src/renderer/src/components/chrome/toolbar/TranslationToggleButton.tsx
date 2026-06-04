import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

interface TranslationToggleButtonProps {
  isActive: boolean
  isPending: boolean
  title: string
  onToggle: () => void
}

export default function TranslationToggleButton({
  isActive,
  isPending,
  title,
  onToggle
}: TranslationToggleButtonProps) {
  return (
    <button
      className={[
        'sm-icon-button',
        styles['sm-workspace-toolbar__button'],
        isActive && styles['is-active'],
        isPending && styles['is-pending']
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
      aria-label={title}
      onClick={onToggle}
    >
      <SvgIcon name="translate" size={18} />
    </button>
  )
}
