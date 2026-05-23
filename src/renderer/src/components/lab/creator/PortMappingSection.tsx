import { useState } from 'react'
import type { LabCreateType, PortMapping } from '@renderer/stores/lab/types'

import styles from './PortMappingSection.module.css'

type PortMappingCreateType = Extract<LabCreateType, 'compose' | 'dockerfile'>

interface PortMappingSectionProps {
  createType: PortMappingCreateType
  portMappings: PortMapping[]
  onRefresh: () => void
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<PortMapping>) => void
  onRemove: (index: number) => void
}

function parseOptionalPort(value: string): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRequiredPort(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function PortMappingSection({
  createType,
  portMappings,
  onRefresh,
  onAdd,
  onUpdate,
  onRemove
}: PortMappingSectionProps) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className={styles['port-mapping-section']}>
      <div className={styles['port-mapping-header']}>
        <button
          type="button"
          className={styles['port-mapping-toggle']}
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
        >
          <span
            className={`${styles['toggle-chevron']} ${collapsed ? styles['toggle-chevron--collapsed'] : ''}`}
          >
            ›
          </span>
          <h3 className={styles['port-mapping-title']}>端口映射</h3>
        </button>
        <div className={styles['port-mapping-actions']}>
          <button type="button" className={styles['btn-small']} onClick={onRefresh}>
            重新解析
          </button>
          <button type="button" className={styles['btn-small']} onClick={onAdd}>
            + 添加
          </button>
        </div>
      </div>

      <div
        className={`${styles['port-mapping-collapse']} ${collapsed ? styles['port-mapping-collapse--collapsed'] : ''}`}
      >
        <div className={styles['port-mapping-collapse__inner']}>
          <p className={styles['port-mapping-hint']}>
            已从{createType === 'compose' ? 'docker-compose.yaml' : 'Dockerfile EXPOSE 指令'}
            自动解析端口映射，您可以手动修改
          </p>

          {portMappings.length === 0 ? (
            <div className={styles['port-mapping-empty']}>
              未检测到端口映射，点击&ldquo;添加&rdquo;手动配置
            </div>
          ) : (
            <div className={styles['port-mapping-list']}>
              {portMappings.map((mapping, index) => (
                <div key={index} className={styles['port-mapping-item']}>
                  <div className={[styles['port-field'], styles['host-port']].join(' ')}>
                    <label>主机端口</label>
                    <input
                      type="number"
                      value={mapping.hostPort ?? ''}
                      placeholder="自动"
                      min="1"
                      max="65535"
                      onChange={(e) =>
                        onUpdate(index, { hostPort: parseOptionalPort(e.target.value) })
                      }
                    />
                  </div>

                  <span className={styles['port-arrow']}>→</span>

                  <div className={[styles['port-field'], styles['container-port']].join(' ')}>
                    <label>容器端口</label>
                    <input
                      type="number"
                      value={mapping.containerPort || ''}
                      min="1"
                      max="65535"
                      onChange={(e) =>
                        onUpdate(index, { containerPort: parseRequiredPort(e.target.value) })
                      }
                    />
                  </div>

                  <div className={[styles['port-field'], styles.protocol].join(' ')}>
                    <label>协议</label>
                    <select
                      value={mapping.protocol}
                      onChange={(e) =>
                        onUpdate(index, { protocol: e.target.value as PortMapping['protocol'] })
                      }
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    className={styles['btn-remove']}
                    title="删除此端口映射"
                    onClick={() => onRemove(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
