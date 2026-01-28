<script setup lang="ts">
import { ref, onMounted } from 'vue'
import EmbeddingModelItem from '../embedding/EmbeddingModelItem.vue'
import EmbeddingModelForm from '../embedding/EmbeddingModelForm.vue'
import { useEmbeddingModels } from '@renderer/composables/useEmbeddingModels'
import type { EmbeddingConfig } from '@shared/types/config'

interface Props {
  errorMessage: string
  successMessage: string
}

interface Emits {
  (e: 'update:errorMessage', value: string): void
  (e: 'update:successMessage', value: string): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

// 使用 composable
const { embeddingModels, loading, loadModels, saveModel, deleteModel, testModel, setDefaultModel } =
  useEmbeddingModels()

// UI 状态
const showAddForm = ref(false)
const testingModelId = ref<string | null>(null)
const editingModelId = ref<string | null>(null)
const editingModelConfig = ref<EmbeddingConfig | null>(null)

// 显示消息
function showError(message: string): void {
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 2000)
}

// 编辑模型
function handleEdit(id: string): void {
  const config = embeddingModels.value[id]
  if (config) {
    editingModelId.value = id
    editingModelConfig.value = { ...config }
    showAddForm.value = true
  }
}

// 删除模型
async function handleDelete(id: string): Promise<void> {
  const success = await deleteModel(id)
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
    const result = await testModel(id)
    if (result.success) {
      showSuccess('连接测试成功')
    } else {
      showError(result.error || '连接测试失败')
    }
  } finally {
    testingModelId.value = null
  }
}

// 设置默认模型
async function handleSetDefault(id: string): Promise<void> {
  const success = await setDefaultModel(id)
  if (success) {
    showSuccess('默认模型已设置')
  } else {
    showError('设置默认模型失败')
  }
}

// 保存模型（新增或更新）
async function handleSave(id: string, config: EmbeddingConfig): Promise<void> {
  const success = await saveModel(id, config)
  if (success) {
    showSuccess(editingModelId.value ? '嵌入模型已更新' : '嵌入模型已添加')
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
    // 使用一个临时ID进行测试
    const tempId = '__test__'
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

    // 清理测试配置
    await window.api.embeddingModels.delete(tempId)
  } catch (error) {
    showError(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 组件挂载时加载模型
onMounted(() => {
  loadModels()
})
</script>

<template>
  <div class="tab-content">
    <!-- 模型列表 -->
    <div v-if="!showAddForm" class="model-list">
      <div v-if="loading" class="loading-state">
        <p>加载中...</p>
      </div>

      <EmbeddingModelItem
        v-for="(config, id) in embeddingModels"
        v-else
        :key="id"
        :id="id"
        :config="config"
        :is-default="false"
        :testing="testingModelId === id"
        @edit="handleEdit"
        @delete="handleDelete"
        @test="handleTest"
        @set-default="handleSetDefault"
      />

      <!-- 空状态 -->
      <div v-if="!loading && Object.keys(embeddingModels).length === 0" class="empty-state">
        <p>暂无嵌入模型配置</p>
      </div>
    </div>

    <!-- 添加/编辑表单 -->
    <EmbeddingModelForm
      v-if="showAddForm"
      :existing-ids="Object.keys(embeddingModels).filter((id) => id !== editingModelId)"
      @submit="handleSave"
      @cancel="handleCancel"
      @test="handleTestNew"
    />

    <!-- 添加模型按钮 -->
    <button v-if="!showAddForm" class="btn add-model-btn" @click="showAddForm = true">
      + 添加嵌入模型
    </button>
  </div>
</template>

<style scoped>
.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--theme-text-secondary);
}

.add-model-btn {
  width: 100%;
  padding: 12px;
  border-style: dashed;
  color: var(--theme-text-secondary);
}

.add-model-btn:hover {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
</style>
