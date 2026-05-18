<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import EmbeddingModelItem from '../embedding/EmbeddingModelItem.vue'
import EmbeddingModelForm from '../embedding/EmbeddingModelForm.vue'
import { useKnowledgeStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { EmbeddingConfig } from '@shared/types/config'

// 直接使用 Knowledge Store
const knowledgeStore = useZustandStore(useKnowledgeStore)

const notify = useNotification()

// UI 状态
const showAddForm = ref(false)
const testingModelId = ref<string | null>(null)
const editingModelId = ref<string | null>(null)
const editingModelConfig = ref<EmbeddingConfig | null>(null)

// 显示消息
function showError(message: string): void {
  notify.error('嵌入模型', message, { source: 'settings' })
}

function showSuccess(message: string): void {
  notify.success('嵌入模型', message, { source: 'settings' })
}

function showInfo(message: string): void {
  notify.info('嵌入模型', message, { source: 'settings' })
}

// 编辑模型
function handleEdit(id: string): void {
  const config = knowledgeStore.embeddingModels[id]
  if (config) {
    editingModelId.value = id
    editingModelConfig.value = { ...config }
    showAddForm.value = true
  }
}

// 获取所有显示名称列表（用于冲突检查）
const existingNames = computed(() => {
  return Object.values(knowledgeStore.embeddingModels).map(
    (config) => (config as { displayName?: string }).displayName || ''
  )
})

// 删除模型
async function handleDelete(id: string): Promise<void> {
  const success = await knowledgeStore.deleteEmbeddingModel(id)
  if (success) {
    showSuccess('嵌入模型已删除')
  } else {
    showError('删除嵌入模型失败')
  }
}

// 测试模型
async function handleTest(id: string): Promise<void> {
  testingModelId.value = id
  try {
    const result = await knowledgeStore.testEmbeddingModel(id)
    if (result.success) {
      showSuccess('连接测试成功')
    } else {
      showError(result.error || '连接测试失败')
    }
  } finally {
    testingModelId.value = null
  }
}

// 保存模型（新增或更新）
async function handleSave(id: string, config: EmbeddingConfig): Promise<void> {
  const success = await knowledgeStore.saveEmbeddingModel(id, config)
  if (success) {
    showSuccess(editingModelId.value ? '嵌入模型已更新' : '嵌入模型已添加')
    if (editingModelId.value) {
      showInfo('编辑后保存为新配置是正常逻辑，原配置不受影响。')
    }
    showAddForm.value = false
    editingModelId.value = null
    editingModelConfig.value = null
  } else {
    showError(editingModelId.value ? '更新嵌入模型失败' : '添加嵌入模型失败')
  }
}

// 取消添加/编辑
function handleCancel(): void {
  showAddForm.value = false
  editingModelId.value = null
  editingModelConfig.value = null
}

// 测试新模型配置（未保存）
async function handleTestNew(config: EmbeddingConfig): Promise<void> {
  try {
    const tempId = `${config.displayName}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const result = await window.api.embeddingModels.save(tempId, config)
    if (!result.success) {
      showError('保存测试配置失败')
      return
    }

    const testResult = await window.api.embeddingModels.test(tempId)
    if (testResult.success) {
      showSuccess('连接测试成功')
    } else {
      showError(testResult.error || '连接测试失败')
    }

    await window.api.embeddingModels.delete(tempId)
  } catch (error) {
    showError(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 保存配置
const saving = ref(false)
async function handleSaveConfig(): Promise<void> {
  saving.value = true
  try {
    await knowledgeStore.loadEmbeddingModels()
    showSuccess('嵌入模型配置已保存')
  } finally {
    saving.value = false
  }
}

// 组件挂载时加载模型
onMounted(() => {
  knowledgeStore.loadEmbeddingModels()
})
</script>

<template>
  <div class="sm-settings-page tab-content">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">嵌入模型配置</h2>
      <p class="sm-settings-page__description">
        向量模型决定知识库检索质量。这里统一管理嵌入模型、测试连接和新建配置入口。
      </p>
    </header>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">模型列表</h3>
          <p class="sm-settings-page__section-description">
            当前共 {{ Object.keys(knowledgeStore.embeddingModels).length }} 个嵌入模型配置。
          </p>
        </div>
      </div>

      <div class="model-list">
        <div v-if="knowledgeStore.embeddingLoading" class="sm-settings-empty">
          <p>加载中...</p>
        </div>

        <EmbeddingModelItem
          v-for="(config, id) in knowledgeStore.embeddingModels"
          v-else
          :id="String(id)"
          :key="id"
          :config="config"
          :testing="testingModelId === id"
          @edit="handleEdit"
          @delete="handleDelete"
          @test="handleTest"
        />

        <div
          v-if="
            !knowledgeStore.embeddingLoading &&
            Object.keys(knowledgeStore.embeddingModels).length === 0
          "
          class="sm-settings-empty"
        >
          <p>暂无嵌入模型配置</p>
        </div>
      </div>

      <EmbeddingModelForm
        v-if="showAddForm"
        :existing-names="existingNames"
        :editing-name="editingModelId || undefined"
        :editing-config="editingModelConfig"
        @submit="handleSave"
        @cancel="handleCancel"
        @test="handleTestNew"
      />

      <button v-if="!showAddForm" class="sm-button add-model-btn" @click="showAddForm = true">
        添加嵌入模型
      </button>
    </section>

    <div class="save-actions">
      <button class="sm-button sm-button--primary" :disabled="saving" @click="handleSaveConfig">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-model-btn {
  width: 100%;
  padding: 12px;
  border-style: dashed;
  color: var(--sm-color-text-secondary);
}

.add-model-btn:hover {
  color: var(--sm-color-accent-hover);
  border-color: var(--sm-color-border-accent);
}

.save-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
