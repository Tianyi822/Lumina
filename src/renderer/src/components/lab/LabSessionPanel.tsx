import { useCallback, type FC } from 'react'
import type { LabDisciplineId } from '@shared/types/config'
import type { LabListItem } from '@renderer/types'
import { LAB_DISCIPLINE_PRESETS } from '@shared/utils/labFeatures'
import styles from './LabSessionPanel.module.css'

/** LabSessionPanel 受控组件的 props */
export interface LabSessionPanelProps {
  /** 当前选中的学科；null 表示未选 */
  discipline: LabDisciplineId | null
  /** 当前绑定的实验室 ID；null 表示未绑定 */
  labId: string | null
  /** 已启用的学科列表（来自 labFeatures 配置） */
  enabledDisciplines: LabDisciplineId[]
  /** 已连接且 running 的实验室列表 */
  connectedLabs: LabListItem[]
  /** 是否禁用整个面板 */
  disabled?: boolean
  /** 选择变更回调 */
  onChange: (next: { discipline: LabDisciplineId | null; labId: string | null }) => void
}

/**
 * 实验室会话选择面板（受控组件）
 * 学科单选 chip 组 + 实验室单选列表，用于在论文聊天中选择激活的实验室学科与绑定
 */
export const LabSessionPanel: FC<LabSessionPanelProps> = ({
  discipline,
  labId,
  enabledDisciplines,
  connectedLabs,
  disabled = false,
  onChange
}) => {
  // 可选学科：取预设与已启用学科的交集，保持预设顺序
  const availableDisciplines = LAB_DISCIPLINE_PRESETS.filter((p) =>
    enabledDisciplines.includes(p.id)
  )

  const handleDisciplineClick = useCallback(
    (id: LabDisciplineId) => {
      // 再次点击当前学科 → 取消选择，同时清空实验室绑定
      if (discipline === id) {
        onChange({ discipline: null, labId: null })
      } else {
        // 切换学科 → 清空实验室绑定（不同学科的实验室语义不同）
        onChange({ discipline: id, labId: null })
      }
    },
    [discipline, onChange]
  )

  const handleLabClick = useCallback(
    (targetLabId: string) => {
      // 再次点击当前实验室 → 取消绑定
      if (labId === targetLabId) {
        onChange({ discipline, labId: null })
      } else {
        onChange({ discipline, labId: targetLabId })
      }
    },
    [discipline, labId, onChange]
  )

  return (
    <div className={`${styles.panel} ${disabled ? styles.panelDisabled : ''}`}>
      {/* 学科选择 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>学科</p>
        {availableDisciplines.length === 0 ? (
          <p className={styles.emptyHint}>请在设置中先启用某个学科实验室</p>
        ) : (
          <div className={styles.chipGroup}>
            {availableDisciplines.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`${styles.chip} ${discipline === d.id ? styles.chipActive : ''}`}
                onClick={() => handleDisciplineClick(d.id)}
                disabled={disabled}
                aria-pressed={discipline === d.id}
                title={d.description}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 实验室绑定 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>实验室</p>
        {connectedLabs.length === 0 ? (
          <p className={styles.emptyHint}>
            请先在实验室页面连接一个 SSH 服务器，或前往实验室页面。
            {/* TODO: 后续任务接入 useUIStateStore.setCurrentView('lab') 实现跳转 */}
          </p>
        ) : (
          <div className={styles.labList}>
            {connectedLabs.map((lab) => (
              <button
                key={lab.labId}
                type="button"
                className={`${styles.labItem} ${labId === lab.labId ? styles.labItemActive : ''}`}
                onClick={() => handleLabClick(lab.labId)}
                disabled={disabled}
                aria-pressed={labId === lab.labId}
              >
                {lab.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
