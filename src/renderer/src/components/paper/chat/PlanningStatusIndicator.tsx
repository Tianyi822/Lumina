import type { CSSProperties } from 'react'
import styles from './PlanningStatusIndicator.module.css'

interface PlanningStatusIndicatorProps {
  text: string
  animating?: boolean
}

/** 执行计划加载中的逐字动画状态指示器 */
export default function PlanningStatusIndicator({
  text,
  animating = true
}: PlanningStatusIndicatorProps) {
  return (
    <span
      className={`${styles['paper-planning-status']} ${
        animating ? styles['paper-planning-status--animating'] : ''
      }`}
    >
      <span className={styles['paper-planning-status__text']} data-text={text}>
        {Array.from(text).map((char, index) => (
          <span
            key={`${char}-${index}`}
            className={styles['paper-planning-status__char']}
            style={{ '--paper-planning-status-stagger-index': index } as CSSProperties}
          >
            {char}
          </span>
        ))}
      </span>
    </span>
  )
}
