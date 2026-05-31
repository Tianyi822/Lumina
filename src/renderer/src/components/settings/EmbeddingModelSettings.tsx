import { useState, useMemo, useEffect, useCallback } from 'react'
import { useKnowledgeStore } from '@renderer/stores/knowledgeStore'
import { notifySuccess, notifyError, notifyInfo } from '@renderer/composables/notificationCore'
import type { EmbeddingConfig } from '@shared/types/config'
import EmbeddingModelItem from '../embedding/EmbeddingModelItem'
import EmbeddingModelForm from '../embedding/EmbeddingModelForm'
import { useEmbeddingModelTest } from './hooks/useEmbeddingModelTest'
import styles from './EmbeddingModelSettings.module.css'

export default function EmbeddingModelSettings() {
  // Zustand selectors
  const embeddingModels = useKnowledgeStore((s) => s.embeddingModels)
  const embeddingLoading = useKnowledgeStore((s) => s.embeddingLoading)
  const loadEmbeddingModels = useKnowledgeStore((s) => s.loadEmbeddingModels)
  const saveEmbeddingModel = useKnowledgeStore((s) => s.saveEmbeddingModel)
  const deleteEmbeddingModel = useKnowledgeStore((s) => s.deleteEmbeddingModel)
  const testEmbeddingModel = useKnowledgeStore((s) => s.testEmbeddingModel)

  // UI 状态
  const [showAddForm, setShowAddForm] = useState(false)
  const [testingModelId, setTestingModelId] = useState<string | null>(null)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editingModelConfig, setEditingModelConfig] = useState<EmbeddingConfig | null>(null)
  const [saving, setSaving] = useState(false)

  // 计算已有名称列表
  const existingNames = useMemo(
    () =>
      Object.values(embeddingModels).map(
        (config) => (config as { displayName?: string }).displayName || ''
      ),
    [embeddingModels]
  )

  // 组件挂载时加载模型
  useEffect(() => {
    void loadEmbeddingModels()
  }, [loadEmbeddingModels])

  // 编辑模型
  const handleEdit = useCallback((id: string) => {
    const config = useKnowledgeStore.getState().embeddingModels[id]
    if (config) {
      setEditingModelId(id)
      setEditingModelConfig({ ...config })
      setShowAddForm(true)
    }
  }, [])

  // 删除模型
  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteEmbeddingModel(id)
      if (success) {
        notifySuccess('嵌入模型', '嵌入模型已删除', { source: 'settings' })
      } else {
        notifyError('嵌入模型', '删除嵌入模型失败', { source: 'settings' })
      }
    },
    [deleteEmbeddingModel]
  )

  // 测试模型（已保存的）
  const handleTest = useCallback(
    async (id: string) => {
      setTestingModelId(id)
      try {
        const result = await testEmbeddingModel(id)
        if (result.success) {
          notifySuccess('嵌入模型', '连接测试成功', { source: 'settings' })
        } else {
          notifyError('嵌入模型', result.error || '连接测试失败', { source: 'settings' })
        }
      } finally {
        setTestingModelId(null)
      }
    },
    [testEmbeddingModel]
  )

  // 保存模型（新增或更新）
  const handleSave = useCallback(
    async (id: string, config: EmbeddingConfig) => {
      const isEditing = editingModelId !== null
      const success = await saveEmbeddingModel(id, config)
      if (success) {
        notifySuccess('嵌入模型', isEditing ? '嵌入模型已更新' : '嵌入模型已添加', {
          source: 'settings'
        })
        if (isEditing) {
          notifyInfo('嵌入模型', '编辑后保存为新配置是正常逻辑，原配置不受影响。', {
            source: 'settings'
          })
        }
        setShowAddForm(false)
        setEditingModelId(null)
        setEditingModelConfig(null)
      } else {
        notifyError('嵌入模型', isEditing ? '更新嵌入模型失败' : '添加嵌入模型失败', {
          source: 'settings'
        })
      }
    },
    [saveEmbeddingModel, editingModelId]
  )

  // 取消添加/编辑
  const handleCancel = useCallback(() => {
    setShowAddForm(false)
    setEditingModelId(null)
    setEditingModelConfig(null)
  }, [])

  // 测试新模型配置（未保存的，通过临时 IPC）
  const { testNewModel } = useEmbeddingModelTest()

  const handleTestNew = useCallback(
    async (config: EmbeddingConfig) => {
      const tempId = `${config.displayName}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      try {
        const { saveResult, testResult } = await testNewModel(
          tempId,
          config as unknown as Record<string, unknown>
        )

        if (!saveResult.success) {
          notifyError('嵌入模型', '保存测试配置失败', { source: 'settings' })
          return
        }

        if (testResult?.success) {
          notifySuccess('嵌入模型', '连接测试成功', { source: 'settings' })
        } else {
          notifyError('嵌入模型', testResult?.error || '连接测试失败', { source: 'settings' })
        }
      } catch (error) {
        notifyError(
          '嵌入模型',
          `测试失败: ${error instanceof Error ? error.message : String(error)}`,
          { source: 'settings' }
        )
      }
    },
    [testNewModel]
  )

  // 保存配置
  const handleSaveConfig = useCallback(async () => {
    setSaving(true)
    try {
      await loadEmbeddingModels()
      notifySuccess('嵌入模型', '嵌入模型配置已保存', { source: 'settings' })
    } finally {
      setSaving(false)
    }
  }, [loadEmbeddingModels])

  const modelEntries = Object.entries(embeddingModels)
  const modelCount = modelEntries.length

  return (
    <div className={['sm-settings-page', 'tab-content'].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">嵌入模型配置</h2>
        <p className="sm-settings-page__description">
          向量模型决定知识库检索质量。这里统一管理嵌入模型、测试连接和新建配置入口。
        </p>
      </header>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">模型列表</h3>
            <p className="sm-settings-page__section-description">
              当前共 {modelCount} 个嵌入模型配置。
            </p>
          </div>
        </div>

        <div className={styles['model-list']}>
          {embeddingLoading && (
            <div className="sm-settings-empty">
              <p>加载中...</p>
            </div>
          )}

          {!embeddingLoading &&
            modelEntries.map(([id, config]) => (
              <EmbeddingModelItem
                key={id}
                id={id}
                config={config}
                testing={testingModelId === id}
                onEdit={handleEdit}
                onDelete={(id) => void handleDelete(id)}
                onTest={(id) => void handleTest(id)}
              />
            ))}

          {!embeddingLoading && modelCount === 0 && (
            <div className="sm-settings-empty">
              <p>暂无嵌入模型配置</p>
            </div>
          )}
        </div>

        {showAddForm && (
          <EmbeddingModelForm
            existingNames={existingNames}
            editingName={editingModelId || undefined}
            editingConfig={editingModelConfig}
            onSubmit={(name, config) => void handleSave(name, config)}
            onCancel={handleCancel}
            onTest={(config) => void handleTestNew(config)}
          />
        )}

        {!showAddForm && (
          <button
            className={['sm-button', styles['add-model-btn']].join(' ')}
            onClick={() => setShowAddForm(true)}
          >
            添加嵌入模型
          </button>
        )}
      </section>

      <div className={styles['save-actions']}>
        <button
          className="sm-button sm-button--primary"
          disabled={saving}
          onClick={() => void handleSaveConfig()}
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}
