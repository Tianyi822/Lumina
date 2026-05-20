import styles from './CreateTypeSelector.module.css'

type CreateType = 'compose' | 'dockerfile' | 'existing' | 'ssh'

interface CreateTypeSelectorProps {
  createType: CreateType
  dockerReady: boolean
  onChange: (type: CreateType) => void
}

const types: { type: CreateType; label: string; desc: string }[] = [
  { type: 'compose', label: 'Docker Compose', desc: '从 docker-compose.yml 文件创建多容器实验室' },
  { type: 'dockerfile', label: 'Dockerfile', desc: '从 Dockerfile 构建自定义容器实验室' },
  { type: 'existing', label: '已有容器', desc: '关联已经运行的 Docker 容器' },
  { type: 'ssh', label: 'SSH 远程', desc: '连接到远程 SSH 服务器' }
]

export default function CreateTypeSelector({
  createType,
  dockerReady,
  onChange
}: CreateTypeSelectorProps) {
  return (
    <div className={styles['create-type-selector']}>
      {types.map((t) => (
        <button
          key={t.type}
          className={`${styles['type-option']} ${createType === t.type ? styles.active : ''}`}
          disabled={t.type !== 'ssh' && !dockerReady}
          onClick={() => onChange(t.type)}
        >
          <strong>{t.label}</strong>
          <span>{t.desc}</span>
        </button>
      ))}
    </div>
  )
}
