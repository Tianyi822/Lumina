import { getFileIconInfo } from '../../shared/composables/useFileIcon'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './FileIcon.module.css'

/** 文件类型图标组件，根据 fileType 显示对应的 SVG 图标 */
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
