import { useCallback } from 'react'
import type { CSSProperties } from 'react'
import styles from './LabList.module.css'
import type { LabListItem, LabStatus } from '@renderer/types/lab'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { CssTransitionGroup } from '@renderer/components/motion/CssTransition'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'

type LabCreationType = 'existing' | 'compose' | 'dockerfile' | 'ssh'

interface ExtendedLabListItem extends Omit<
  LabListItem,
  'creationType' | 'containerCount' | 'isOrphan'
> {
  creationType?: LabCreationType
  containerIds?: string[]
  isOrphan?: boolean
  composeProjectName?: string
}

interface LabListProps {
  labs: LabListItem[]
  activeLabId?: string
  deletingLabId?: string | null
  onSelect: (labId: string) => void
  onDelete: (labId: string) => void
}

function getStatusLabel(status: LabStatus, creationType?: LabCreationType): string {
  if (creationType === 'ssh') {
    const sshLabels: Record<LabStatus, string> = {
      creating: '连接中',
      running: '已连接',
      stopped: '未连接',
      error: '连接失败'
    }
    return sshLabels[status] || status
  }
  const labels: Record<LabStatus, string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '错误'
  }
  return labels[status] || status
}

function getCreationTypeLabel(type?: LabCreationType): string {
  if (!type) return ''
  const labels: Record<LabCreationType, string> = {
    existing: '已有容器',
    compose: 'Compose',
    dockerfile: 'Dockerfile',
    ssh: 'SSH'
  }
  return labels[type] || type
}

function getContainerCount(item: LabListItem): number {
  return (item as unknown as ExtendedLabListItem).containerIds?.length || 0
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
        {({ item: lab, index, transitionKey, className, ref }) => {
          const ext = lab as unknown as ExtendedLabListItem
          return (
            <div
              ref={ref}
              key={transitionKey}
              className={[
                styles['lab-item'],
                lab.labId === activeLabId && styles.active,
                ext.isOrphan && styles.orphan,
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
                    {getStatusLabel(lab.status, ext.creationType)}
                  </span>
                  {ext.creationType && (
                    <span
                      className={`${styles['sm-lab-list__creation-badge']} ${styles[`creation-type-${ext.creationType}`]}`}
                    >
                      {getCreationTypeLabel(ext.creationType)}
                    </span>
                  )}
                  {ext.isOrphan && (
                    <span className={styles['sm-lab-list__orphan-badge']} title="容器已丢失">
                      ⚠️ 容器已丢失
                    </span>
                  )}
                  {getContainerCount(lab) > 1 && (
                    <span
                      className={styles['sm-lab-list__container-count']}
                      title={`包含 ${getContainerCount(lab)} 个容器`}
                    >
                      {getContainerCount(lab)} 容器
                    </span>
                  )}
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
          )
        }}
      </CssTransitionGroup>
      {labs.length === 0 && <div className={styles['empty-list']}>暂无实验室</div>}
    </div>
  )
}
