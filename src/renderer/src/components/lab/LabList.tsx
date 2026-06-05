import { useCallback } from 'react'
import type { CSSProperties } from 'react'
import styles from './LabList.module.css'
import type { LabListItem, LabStatus } from '@renderer/types/lab'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { CssTransitionGroup } from '@renderer/components/motion/CssTransition'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'

function getStatusLabel(status: LabStatus): string {
  const sshLabels: Record<LabStatus, string> = {
    creating: '连接中',
    running: '已连接',
    stopped: '未连接',
    error: '连接失败'
  }
  return sshLabels[status] || status
}

interface LabListProps {
  labs: LabListItem[]
  activeLabId?: string
  deletingLabId?: string | null
  onSelect: (labId: string) => void
  onDelete: (labId: string) => void
}

export default function LabList({
  labs,
  activeLabId,
  deletingLabId,
  onSelect,
  onDelete
}: LabListProps) {
  const getLabKey = useCallback((lab: LabListItem): string => lab.labId, [])

  return (
    <div className={styles['lab-list']}>
      <CssTransitionGroup items={labs} name="sm-sidebar-list-item" getKey={getLabKey} appear>
        {({ item: lab, index, transitionKey, className, ref }) => (
          <div
            ref={ref}
            key={transitionKey}
            className={[
              styles['lab-item'],
              lab.labId === activeLabId && styles.active,
              className
            ]
              .filter(Boolean)
              .join(' ')}
            style={getSidebarListItemMotionStyle(index) as CSSProperties}
            onClick={() => onSelect(lab.labId)}
          >
            <div className={styles['lab-info']}>
              <div className={styles['lab-name']}>{lab.name}</div>
              <div className={styles['lab-meta']}>
                <span className={`${styles['lab-status']} ${styles[`status-${lab.status}`]}`}>
                  {getStatusLabel(lab.status)}
                </span>
                <span
                  className={`${styles['sm-lab-list__creation-badge']} ${styles['creation-type-ssh']}`}
                >
                  SSH
                </span>
              </div>
            </div>
            <button
              className={`${styles['sm-lab-list__delete-button']} ${lab.labId === deletingLabId ? styles['is-deleting'] : ''}`}
              title="删除实验室"
              disabled={lab.labId === deletingLabId}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(lab.labId)
              }}
            >
              {lab.labId === deletingLabId ? (
                <SvgIcon name="loading" size={14} spin />
              ) : (
                <SvgIcon name="trash" size={14} />
              )}
            </button>
          </div>
        )}
      </CssTransitionGroup>
      {labs.length === 0 && <div className={styles['empty-list']}>暂无实验室</div>}
    </div>
  )
}
