import type { CSSProperties } from 'react'
import { icons } from './icons'
import styles from './SvgIcon.module.css'

interface SvgIconProps {
  name: string
  size?: number | string
  color?: string
  spin?: boolean
  className?: string
  style?: CSSProperties
}

export default function SvgIcon({
  name,
  size = 16,
  color = 'currentColor',
  spin = false,
  className,
  style
}: SvgIconProps) {
  const iconData = icons[name] || icons['info']

  const iconSize = typeof size === 'number' ? `${size}px` : size

  const iconStyle: CSSProperties = {
    color: color === 'currentColor' ? 'inherit' : color
  }

  const classNames = [styles.icon, spin && styles.spin, className].filter(Boolean).join(' ')

  return (
    <svg
      className={classNames}
      viewBox={iconData.viewBox}
      width={iconSize}
      height={iconSize}
      style={{ ...iconStyle, ...style }}
      fill={iconData.fill || 'none'}
      stroke={iconData.stroke || 'none'}
      strokeWidth={iconData.strokeWidth}
      aria-hidden="true"
    >
      {iconData.path && <path d={iconData.path} />}
      {iconData.paths &&
        iconData.paths.map((p, i) => (
          <path key={i} d={p} />
        ))}
      {iconData.elements && (
        <g dangerouslySetInnerHTML={{ __html: iconData.elements }} />
      )}
    </svg>
  )
}
