import type { ContainerInfo } from '@shared/types/lab/container'
import styles from './ContainerSelector.module.css'

interface ContainerSelectorProps {
  containers: ContainerInfo[]
  selectedId?: string | null
  onSelect: (containerId: string) => void
}

export default function ContainerSelector({
  containers,
  selectedId,
  onSelect
}: ContainerSelectorProps) {
  return (
    <div className={styles['container-selector']}>
      <select
        value={selectedId || ''}
        className="sm-select"
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">选择容器...</option>
        {containers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.names?.[0] || c.id.substring(0, 12)}
          </option>
        ))}
      </select>
    </div>
  )
}
