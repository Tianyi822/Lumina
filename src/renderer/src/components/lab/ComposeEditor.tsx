import { useState, useEffect } from 'react'
import { useComposeConfigStore, useDockerConfigStore, useLabCreatorStore } from '@renderer/stores'
import type { ComposeTemplateType, GeneratorForm } from '@renderer/stores/lab/types'
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
  const composeConfigs = useDockerConfigStore((s) => s.composeConfigs)
  const dockerfileConfigs = useDockerConfigStore((s) => s.dockerfileConfigs)
  const selectedComposeId = useComposeConfigStore((s) => s.selectedComposeId)
  const showGenerator = useComposeConfigStore((s) => s.showGenerator)
  const generatorForm = useComposeConfigStore((s) => s.generatorForm)
  const setSelectedComposeId = useLabCreatorStore((s) => s.setSelectedComposeId)
  const loadSelectedCompose = useLabCreatorStore((s) => s.loadSelectedCompose)
  const setShowGenerator = useLabCreatorStore((s) => s.setShowGenerator)
  const updateGeneratorForm = useLabCreatorStore((s) => s.updateGeneratorForm)
  const onSavedDockerfileSelect = useLabCreatorStore((s) => s.onSavedDockerfileSelect)
  const clearSavedDockerfile = useLabCreatorStore((s) => s.clearSavedDockerfile)
  const resetGeneratorForm = useLabCreatorStore((s) => s.resetGeneratorForm)
  const insertServiceConfig = useLabCreatorStore((s) => s.insertServiceConfig)
  const getComposeTemplate = useLabCreatorStore((s) => s.getComposeTemplate)
  const [localContent, setLocalContent] = useState(modelValue)
  const [localProjectName, setLocalProjectName] = useState(projectName || '')

  useEffect(() => setLocalContent(modelValue), [modelValue])
  useEffect(() => setLocalProjectName(projectName || ''), [projectName])

  function updateContent(value: string): void {
    setLocalContent(value)
    onUpdateModelValue(value)
  }

  function updateProjectName(value: string): void {
    setLocalProjectName(value)
    onUpdateProjectName(value)
  }

  async function handleComposeSelect(value: string): Promise<void> {
    const nextId = value || null
    setSelectedComposeId(nextId)
    if (nextId) {
      await loadSelectedCompose()
    }
  }

  async function handleSavedDockerfileSelect(value: string): Promise<void> {
    updateGeneratorForm({ savedDockerfileId: value || null })
    await onSavedDockerfileSelect()
  }

  function updateGeneratorField<K extends keyof GeneratorForm>(
    key: K,
    value: GeneratorForm[K]
  ): void {
    updateGeneratorForm({ [key]: value } as Partial<GeneratorForm>)
  }

  function applyComposeTemplate(templateType: ComposeTemplateType): void {
    updateContent(getComposeTemplate(templateType))
  }

  function clearContent(): void {
    updateContent("version: '3.8'\n\nservices:\n")
  }

  function handleInsertServiceConfig(): void {
    onUpdateModelValue(localContent)
    insertServiceConfig()
    const nextContent = useComposeConfigStore.getState().composeContent
    setLocalContent(nextContent)
    onUpdateModelValue(nextContent)
  }

  return (
    <div className={styles['compose-editor']}>
      <h3>Docker Compose 配置</h3>

      <div className={styles['form-field']}>
        <label>项目名称（可选）</label>
        <input
          value={localProjectName}
          type="text"
          className={styles.input}
          placeholder="my-project"
          onChange={(e) => updateProjectName(e.target.value)}
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
            value={selectedComposeId || ''}
            className={styles.select}
            onChange={(e) => {
              void handleComposeSelect(e.target.value)
            }}
          >
            <option value="">选择已保存的配置...</option>
            {composeConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles['generator-section']}>
        <div
          className={styles['generator-header']}
          onClick={() => setShowGenerator(!showGenerator)}
        >
          <span className={styles['generator-title']}>构建配置生成器</span>
          <span className={`${styles['generator-toggle']} ${showGenerator ? styles.expanded : ''}`}>
            ▼
          </span>
        </div>

        {showGenerator && (
          <div className={styles['generator-form']}>
            <div className={styles['form-row']}>
              <div className={styles['form-field-inline']}>
                <label>服务名称</label>
                <input
                  value={generatorForm.serviceName}
                  type="text"
                  className={styles.input}
                  placeholder="app"
                  onChange={(e) => updateGeneratorField('serviceName', e.target.value)}
                />
              </div>
              <div className={styles['form-field-inline']}>
                <label>来源类型</label>
                <div className={styles['radio-group']}>
                  <label className={styles['radio-option']}>
                    <input
                      checked={generatorForm.sourceType === 'image'}
                      type="radio"
                      value="image"
                      onChange={() => updateGeneratorField('sourceType', 'image')}
                    />
                    <span>镜像</span>
                  </label>
                  <label className={styles['radio-option']}>
                    <input
                      checked={generatorForm.sourceType === 'build'}
                      type="radio"
                      value="build"
                      onChange={() => updateGeneratorField('sourceType', 'build')}
                    />
                    <span>构建</span>
                  </label>
                </div>
              </div>
            </div>

            {generatorForm.sourceType === 'image' ? (
              <div className={styles['form-field']}>
                <label>镜像名称</label>
                <input
                  value={generatorForm.image}
                  type="text"
                  className={styles.input}
                  placeholder="node:18-alpine"
                  onChange={(e) => updateGeneratorField('image', e.target.value)}
                />
              </div>
            ) : (
              <>
                <div className={styles['form-field']}>
                  <label>
                    使用已保存的 Dockerfile
                    {generatorForm.useSavedDockerfile && (
                      <button className={styles['btn-link']} onClick={clearSavedDockerfile}>
                        清除选择
                      </button>
                    )}
                  </label>
                  <select
                    value={generatorForm.savedDockerfileId || ''}
                    className={styles.select}
                    onChange={(e) => {
                      void handleSavedDockerfileSelect(e.target.value)
                    }}
                  >
                    <option value="">不使用已保存的 Dockerfile</option>
                    {dockerfileConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles['form-row']}>
                  <div className={styles['form-field-inline']}>
                    <label>构建上下文</label>
                    <input
                      value={generatorForm.context}
                      type="text"
                      className={styles.input}
                      placeholder="./app"
                      disabled={generatorForm.useSavedDockerfile}
                      onChange={(e) => updateGeneratorField('context', e.target.value)}
                    />
                  </div>
                  <div className={styles['form-field-inline']}>
                    <label>Dockerfile 名称</label>
                    <input
                      value={generatorForm.dockerfile}
                      type="text"
                      className={styles.input}
                      placeholder="Dockerfile"
                      disabled={generatorForm.useSavedDockerfile}
                      onChange={(e) => updateGeneratorField('dockerfile', e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles['form-field']}>
                  <label>构建参数（可选，逗号分隔，格式：key=value）</label>
                  <input
                    value={generatorForm.buildArgs}
                    type="text"
                    className={styles.input}
                    placeholder="NODE_VERSION=18,API_KEY=xxx"
                    onChange={(e) => updateGeneratorField('buildArgs', e.target.value)}
                  />
                </div>
              </>
            )}

            <div className={styles['form-row']}>
              <div className={styles['form-field-inline']}>
                <label>端口映射（可选，逗号分隔）</label>
                <input
                  value={generatorForm.ports}
                  type="text"
                  className={styles.input}
                  placeholder="3000:3000,8080:8080"
                  onChange={(e) => updateGeneratorField('ports', e.target.value)}
                />
              </div>
              <div className={styles['form-field-inline']}>
                <label>环境变量（可选，逗号分隔）</label>
                <input
                  value={generatorForm.environment}
                  type="text"
                  className={styles.input}
                  placeholder="NODE_ENV=development,DEBUG=true"
                  onChange={(e) => updateGeneratorField('environment', e.target.value)}
                />
              </div>
            </div>

            <div className={styles['generator-actions']}>
              <button className={styles['btn-secondary']} onClick={resetGeneratorForm}>
                重置
              </button>
              <button className={styles['btn-primary']} onClick={handleInsertServiceConfig}>
                插入配置
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles['form-field']}>
        <label>
          docker-compose.yaml
          <div className={styles['template-buttons']}>
            <button
              className={`${styles['btn-template']} ${styles['btn-clear']}`}
              onClick={clearContent}
            >
              清空
            </button>
            <button
              className={styles['btn-template']}
              onClick={() => applyComposeTemplate('image')}
            >
              镜像模板
            </button>
            <button
              className={styles['btn-template']}
              onClick={() => applyComposeTemplate('build')}
            >
              Dockerfile 模板
            </button>
            <button
              className={styles['btn-template']}
              onClick={() => applyComposeTemplate('mixed')}
            >
              混合模板
            </button>
          </div>
        </label>
        <textarea
          value={localContent}
          className={styles['code-editor']}
          placeholder="输入 Docker Compose 配置..."
          spellCheck={false}
          onChange={(e) => updateContent(e.target.value)}
        ></textarea>
      </div>
    </div>
  )
}
