import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

/** 翻译切换按钮，点击开启/关闭论文翻译模式 */
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
