import { useState, useEffect } from 'react'
import styles from './ComposeEditor.module.css'

interface ComposeEditorProps {
  modelValue: string
  projectName?: string
  onUpdateModelValue: (value: string) => void
  onUpdateProjectName: (value: string) => void
  onSaveConfig: () => void
}

export default function ComposeEditor({
  modelValue,
  projectName,
  onUpdateModelValue,
  onUpdateProjectName,
  onSaveConfig
}: ComposeEditorProps) {
  const [localContent, setLocalContent] = useState(modelValue)
  const [localProjectName, setLocalProjectName] = useState(projectName || '')

  useEffect(() => setLocalContent(modelValue), [modelValue])
  useEffect(() => setLocalProjectName(projectName || ''), [projectName])

  return (
    <div className={styles['compose-editor']}>
      <div className={styles['form-field']}>
        <label>项目名称（可选）</label>
        <input
          value={localProjectName}
          type="text"
          className={styles.input}
          placeholder="my-compose-project"
          onChange={(e) => {
            setLocalProjectName(e.target.value)
            onUpdateProjectName(e.target.value)
          }}
        />
      </div>

      <div className={styles['form-field']}>
        <label>
          已保存配置
          <button className={styles['btn-link']} onClick={onSaveConfig}>
            另存为
          </button>
        </label>
      </div>

      <div className={styles['form-field']}>
        <label>docker-compose.yml</label>
        <textarea
          value={localContent}
          className={styles['code-editor']}
          placeholder="输入 docker-compose.yml 内容..."
          spellCheck={false}
          onChange={(e) => {
            setLocalContent(e.target.value)
            onUpdateModelValue(e.target.value)
          }}
        ></textarea>
      </div>
    </div>
  )
}
