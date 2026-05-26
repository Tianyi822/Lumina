import { useState, useEffect } from 'react'
import {
  useDockerConfigStore,
  useDockerfileConfigStore,
  useLabCreatorStore
} from '@renderer/stores'
import styles from './DockerfileEditor.module.css'

const dockerfileExample = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`

interface DockerfileEditorProps {
  modelValue: string
  context?: string
  onUpdateModelValue: (value: string) => void
  onUpdateContext: (value: string) => void
  onSaveConfig: () => void
}

export default function DockerfileEditor({
  modelValue,
  context,
  onUpdateModelValue,
  onUpdateContext,
  onSaveConfig
}: DockerfileEditorProps) {
  const dockerfileConfigs = useDockerConfigStore((s) => s.dockerfileConfigs)
  const selectedDockerfileId = useDockerfileConfigStore((s) => s.selectedDockerfileId)
  const setSelectedDockerfileId = useLabCreatorStore((s) => s.setSelectedDockerfileId)
  const loadSelectedDockerfile = useLabCreatorStore((s) => s.loadSelectedDockerfile)
  const [localContent, setLocalContent] = useState(modelValue)
  const [localContext, setLocalContext] = useState(context || '')

  useEffect(() => setLocalContent(modelValue), [modelValue])
  useEffect(() => setLocalContext(context || ''), [context])

  function updateContent(value: string): void {
    setLocalContent(value)
    onUpdateModelValue(value)
  }

  function updateContext(value: string): void {
    setLocalContext(value)
    onUpdateContext(value)
  }

  async function handleDockerfileSelect(value: string): Promise<void> {
    const nextId = value || null
    setSelectedDockerfileId(nextId)
    if (nextId) {
      await loadSelectedDockerfile()
    }
  }

  return (
    <div className={styles['dockerfile-editor']}>
      <h3>Dockerfile 配置</h3>
      <div className={styles['form-field']}>
        <label>构建上下文路径（可选）</label>
        <input
          value={localContext}
          type="text"
          className={styles.input}
          placeholder="./my-app"
          onChange={(e) => updateContext(e.target.value)}
        />
      </div>

      <div className={styles['form-field']}>
        <label>
          已保存配置
          <button className={styles['btn-link']} onClick={onSaveConfig}>
            另存为
          </button>
        </label>
        <div className={styles['config-selector']}>
          <select
            value={selectedDockerfileId || ''}
            className={styles.select}
            onChange={(e) => {
              void handleDockerfileSelect(e.target.value)
            }}
          >
            <option value="">选择已保存的配置...</option>
            {dockerfileConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles['form-field']}>
        <label>
          Dockerfile
          <button
            className={styles['btn-link']}
            onClick={() => {
              updateContent(dockerfileExample)
            }}
          >
            使用示例
          </button>
        </label>
        <textarea
          value={localContent}
          className={styles['code-editor']}
          placeholder="输入 Dockerfile 内容..."
          spellCheck={false}
          onChange={(e) => updateContent(e.target.value)}
        ></textarea>
      </div>
    </div>
  )
}
