import { useState, useEffect } from 'react'
import { useDockerConfigStore } from '@renderer/stores'
import styles from './ConfigManager.module.css'

type ConfigType = 'dockerfile' | 'compose'

interface ConfigManagerProps {
  visible: boolean
  onClose: () => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

export default function ConfigManager({ visible, onClose }: ConfigManagerProps) {
  const dockerfileConfigs = useDockerConfigStore((s) => s.dockerfileConfigs)
  const loadDockerfileConfigs = useDockerConfigStore((s) => s.loadDockerfileConfigs)
  const loadDockerfileConfig = useDockerConfigStore((s) => s.loadDockerfileConfig)
  const saveDockerfileConfig = useDockerConfigStore((s) => s.saveDockerfileConfig)
  const deleteDockerfileConfig = useDockerConfigStore((s) => s.deleteDockerfileConfig)

  const [activeTab, setActiveTab] = useState<ConfigType>('dockerfile')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingName, setEditingName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const currentConfigs = dockerfileConfigs
  const selectedConfig = selectedId ? currentConfigs.find((c) => c.id === selectedId) ?? null : null

  useEffect(() => {
    if (visible) {
      loadDockerfileConfigs()
      setSelectedId(null); setEditingContent(''); setEditingName(''); setIsEditing(false)
    }
  }, [visible, loadDockerfileConfigs])

  useEffect(() => {
    setSelectedId(null); setEditingContent(''); setEditingName(''); setIsEditing(false); setDeleteConfirmId(null)
  }, [activeTab])

  async function selectConfig(id: string): Promise<void> {
    setSelectedId(id); setIsEditing(false); setDeleteConfirmId(null)
    const config = await loadDockerfileConfig(id)
    if (config) { setEditingContent(config.content); setEditingName(config.name) }
  }

  async function saveChanges(): Promise<void> {
    if (!selectedId || !editingName.trim()) return
    await saveDockerfileConfig({ id: selectedId, name: editingName.trim(), content: editingContent })
    setIsEditing(false)
  }

  async function deleteConfig(id: string): Promise<void> {
    await deleteDockerfileConfig(id)
    if (selectedId === id) { setSelectedId(null); setEditingContent(''); setEditingName(''); setIsEditing(false) }
    setDeleteConfirmId(null)
  }

  if (!visible) return null

  return (
    <div className={styles['config-manager-overlay']} onClick={onClose}>
      <div className={`sm-modal__surface ${styles['config-manager']}`} onClick={(e) => e.stopPropagation()}>
        <div className={`sm-pane-header ${styles['manager-header']}`}>
          <div className={styles['manager-heading']}>
            <div className={styles['manager-title-row']}><h2>Docker 模板资产</h2></div>
            <p>统一维护 Dockerfile 与 Compose 模板，供实验室创建流程复用。</p>
          </div>
          <button className="sm-button sm-button--secondary sm-button--small" onClick={onClose}>关闭</button>
        </div>

        <div className={styles['manager-tabs']}>
          <button className={`sm-tab ${styles['manager-tab']} ${activeTab === 'dockerfile' ? 'is-active' : ''}`} onClick={() => setActiveTab('dockerfile')}>Dockerfile</button>
          <button className={`sm-tab ${styles['manager-tab']} ${activeTab === 'compose' ? 'is-active' : ''}`} onClick={() => setActiveTab('compose')}>Docker Compose</button>
        </div>

        <div className={styles['manager-body']}>
          <div className={styles['config-list']}>
            <div className={styles['list-header']}>
              <div className={styles['list-heading']}>
                <span className={styles['list-eyebrow']}>模板列表</span>
                <strong>{activeTab === 'dockerfile' ? 'Dockerfile 模板' : 'Compose 模板'}</strong>
              </div>
            </div>
            {activeTab === 'compose' ? (
              <div className={`sm-empty ${styles['list-state']}`}>Compose 配置管理功能开发中</div>
            ) : currentConfigs.length === 0 ? (
              <div className={`sm-empty ${styles['list-state']}`}>暂无 Dockerfile 配置</div>
            ) : (
              <div className={styles['list-items']}>
                {currentConfigs.map((config) => (
                  <button key={config.id} className={`${styles['list-item']} ${selectedId === config.id ? styles.selected : ''}`} type="button" onClick={() => selectConfig(config.id)}>
                    <div className={styles['item-name']}>{config.name}</div>
                    <div className={styles['item-date']}>更新于 {formatDate(config.updatedAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles['config-detail']}>
            {selectedConfig && activeTab === 'dockerfile' ? (
              <>
                <div className={styles['detail-header']}>
                  {isEditing ? (
                    <input value={editingName} type="text" className={`${styles['name-input']} sm-input`} placeholder="配置名称" onChange={(e) => setEditingName(e.target.value)} />
                  ) : (
                    <>
                      <h3 className={styles['detail-title']}>{selectedConfig.name}</h3>
                      <button className="sm-button sm-button--secondary sm-button--small" onClick={() => { setIsEditing(true); setEditingName(selectedConfig.name) }}>编辑</button>
                    </>
                  )}
                </div>
                <div className={styles['detail-meta']}>
                  <span>创建: {formatDate(selectedConfig.createdAt)}</span>
                  <span>更新: {formatDate(selectedConfig.updatedAt)}</span>
                </div>
                <div className={styles['detail-content']}>
                  <label className={styles['content-label']}>Dockerfile</label>
                  <textarea value={editingContent} className={styles['code-editor']} readOnly={!isEditing} spellCheck={false} onChange={(e) => setEditingContent(e.target.value)}></textarea>
                </div>
                <div className={styles['detail-actions']}>
                  {isEditing ? (
                    <>
                      <button className="sm-button sm-button--secondary" onClick={() => { setIsEditing(false); setEditingName(selectedConfig.name) }}>取消</button>
                      <button className="sm-button sm-button--primary" disabled={!editingName.trim()} onClick={saveChanges}>保存更改</button>
                    </>
                  ) : deleteConfirmId === selectedConfig.id ? (
                    <>
                      <span className={styles['delete-hint']}>确定删除？</span>
                      <button className="sm-button sm-button--secondary" onClick={() => setDeleteConfirmId(null)}>取消</button>
                      <button className="sm-button sm-button--danger" onClick={() => deleteConfig(selectedConfig.id)}>确认删除</button>
                    </>
                  ) : (
                    <button className="sm-button sm-button--danger" onClick={() => setDeleteConfirmId(selectedConfig.id)}>删除配置</button>
                  )}
                </div>
              </>
            ) : (
              <div className={`sm-empty ${styles['detail-empty']}`}><p>{activeTab === 'compose' ? 'Compose 配置管理开发中' : '选择左侧配置查看详情'}</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
