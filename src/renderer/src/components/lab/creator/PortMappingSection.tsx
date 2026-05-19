import styles from './creator/PortMappingSection.module.css'

interface PortMapping {
  containerPort: number
  hostPort?: number | null
  protocol: string
  editable?: boolean
}

interface PortMappingSectionProps {
  portMappings: PortMapping[]
  onRefresh: () => void
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<PortMapping>) => void
  onRemove: (index: number) => void
}

export default function PortMappingSection({
  portMappings,
  onRefresh,
  onAdd,
  onUpdate,
  onRemove
}: PortMappingSectionProps) {
  return (
    <div className={styles['port-mapping-section']}>
      <div className={styles['section-header']}>
        <h4>端口映射</h4>
        <button className="sm-button sm-button--secondary sm-button--small" onClick={onRefresh}>
          刷新
        </button>
        <button className="sm-button sm-button--primary sm-button--small" onClick={onAdd}>
          添加
        </button>
      </div>
      {portMappings.map((mapping, index) => (
        <div key={index} className={styles['port-mapping-row']}>
          <input
            type="number"
            className="sm-input"
            placeholder="容器端口"
            value={mapping.containerPort || ''}
            onChange={(e) => onUpdate(index, { containerPort: Number(e.target.value) })}
          />
          <span>:</span>
          <input
            type="number"
            className="sm-input"
            placeholder="主机端口"
            value={mapping.hostPort || ''}
            onChange={(e) => onUpdate(index, { hostPort: Number(e.target.value) })}
          />
          <select
            className="sm-select"
            value={mapping.protocol}
            onChange={(e) => onUpdate(index, { protocol: e.target.value })}
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
          <button className={styles['remove-btn']} onClick={() => onRemove(index)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
