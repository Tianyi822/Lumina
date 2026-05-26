import { getFileIconInfo } from '../../shared/composables/useFileIcon'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './FileIcon.module.css'

interface FileIconProps {
  fileType: string
  size?: number
  className?: string
}

export default function FileIcon({ fileType, size = 24, className }: FileIconProps) {
  const iconInfo = getFileIconInfo(fileType)

  return (
    <div
      className={[styles['file-icon'], styles[iconInfo.iconClass], className]
        .filter(Boolean)
        .join(' ')}
    >
      <SvgIcon name={iconInfo.iconName} size={size} />
    </div>
  )
}
