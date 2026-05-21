import styles from './CreateTypeSelector.module.css'

type CreateType = 'compose' | 'dockerfile' | 'existing' | 'ssh'

interface CreateTypeSelectorProps {
  createType: CreateType
  dockerReady: boolean
  onChange: (type: CreateType) => void
}

const types: { type: CreateType; label: string }[] = [
  { type: 'compose', label: 'Docker Compose' },
  { type: 'dockerfile', label: 'Dockerfile' },
  { type: 'existing', label: '选择已有容器' },
  { type: 'ssh', label: 'SSH 远程服务器' }
]

export default function CreateTypeSelector({
  createType,
  dockerReady,
  onChange
}: CreateTypeSelectorProps) {
  return (
    <div className={styles['creator-type-selection']} role="radiogroup" aria-label="实验室创建方式">
      {types.map((t) => (
        <label
          key={t.type}
          className={[
            styles['type-option'],
            createType === t.type && styles.active,
            t.type !== 'ssh' && !dockerReady && styles.disabled
          ]
            .filter(Boolean)
            .join(' ')}
          title={t.type !== 'ssh' && !dockerReady ? 'Docker 未就绪' : ''}
          role="radio"
          aria-checked={createType === t.type}
        >
          <input
            type="radio"
            value={t.type}
            checked={createType === t.type}
            disabled={t.type !== 'ssh' && !dockerReady}
            onChange={() => onChange(t.type)}
          />
          <span className={styles['option-label']}>{t.label}</span>
        </label>
      ))}
    </div>
  )
}
