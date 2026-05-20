import { useState, useEffect } from 'react'
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
  const [localContent, setLocalContent] = useState(modelValue)
  const [localContext, setLocalContext] = useState(context || '')

  useEffect(() => setLocalContent(modelValue), [modelValue])
  useEffect(() => setLocalContext(context || ''), [context])

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
          onChange={(e) => {
            setLocalContext(e.target.value)
            onUpdateContext(e.target.value)
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
        <label>
          Dockerfile
          <button
            className={styles['btn-link']}
            onClick={() => {
              setLocalContent(dockerfileExample)
              onUpdateModelValue(dockerfileExample)
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
          onChange={(e) => {
            setLocalContent(e.target.value)
            onUpdateModelValue(e.target.value)
          }}
        ></textarea>
      </div>
    </div>
  )
}
