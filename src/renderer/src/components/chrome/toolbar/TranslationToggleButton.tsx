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
    <div className={styles['sm-workspace-toolbar__item-wrap']}>
      <button
        className={[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          isActive && styles['is-active'],
          isPending && styles['is-pending']
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={title}
        onClick={onToggle}
      >
        <SvgIcon name="translate" size={18} />
      </button>
      <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
        {title}
      </span>
    </div>
  )
}
