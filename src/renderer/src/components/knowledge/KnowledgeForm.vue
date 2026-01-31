<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'

// 可用的嵌入模型列表
const embeddingModels = ref<Record<string, EmbeddingConfig>>({})
const loadingModels = ref(true)

const emit = defineEmits<{
  (
    e: 'submit',
    data: {
      name: string
      description: string
      embeddingModel: string
      embeddingDimension: number
    }
  ): void
  (e: 'cancel'): void
}>()

// 表单数据
const name = ref('')
const description = ref('')
const embeddingModel = ref('')

// 加载配置的嵌入模型列表
onMounted(async () => {
  try {
    const result = await window.api.embeddingModels.getAll()
    if (result.success && result.data) {
      embeddingModels.value = result.data

      // 设置默认选中第一个模型或默认模型
      const modelIds = Object.keys(result.data)
      if (modelIds.length > 0) {
        embeddingModel.value = modelIds[0]
      }
    }
  } catch (error) {
    console.error('加载嵌入模型失败:', error)
  } finally {
    loadingModels.value = false
  }
})

// 验证
const isValid = computed(() => {
  if (name.value.trim().length === 0) return false
  if (embeddingModel.value === '') return false
  return true
})

// 获取选中的模型配置
const selectedModelConfig = computed(() => {
  return embeddingModels.value[embeddingModel.value]
})

function handleSubmit(): void {
  if (!isValid.value || !selectedModelConfig.value) return

  const data = {
    name: name.value.trim(),
    description: description.value.trim(),
    embeddingModel: embeddingModel.value,
    embeddingDimension: selectedModelConfig.value.dimensions
  }

  emit('submit', data)
  resetForm()
}

function handleCancel(): void {
  emit('cancel')
  resetForm()
}

function resetForm(): void {
  name.value = ''
  description.value = ''
  const modelIds = Object.keys(embeddingModels.value)
  embeddingModel.value = modelIds.length > 0 ? modelIds[0] : ''
}
</script>

<template>
  <div class="form-overlay" @click.self="handleCancel">
    <div class="form-container">
      <div class="form-header">
        <h2>创建知识库</h2>
        <button class="close-btn" @click="handleCancel">✕</button>
      </div>

      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="kb-name">知识库名称 *</label>
          <input
            id="kb-name"
            v-model="name"
            type="text"
            class="input"
            placeholder="例如：产品文档、技术规范..."
            required
          />
        </div>

        <div class="form-group">
          <label for="kb-description">描述（可选）</label>
          <textarea
            id="kb-description"
            v-model="description"
            class="input textarea"
            rows="3"
            placeholder="简要描述这个知识库的用途..."
          />
        </div>

        <div class="form-group">
          <label for="kb-model">嵌入模型 *</label>
          <select
            id="kb-model"
            v-model="embeddingModel"
            class="input select"
            :disabled="loadingModels"
          >
            <option v-if="loadingModels" value="" disabled>加载中...</option>
            <option
              v-if="!loadingModels && Object.keys(embeddingModels).length === 0"
              value=""
              disabled
            >
              暂无可用模型，请先在设置中配置嵌入模型
            </option>
            <option v-for="(model, id) in embeddingModels" :key="id" :value="id">
              {{ model.displayName || model.model }} ({{ model.dimensions }} 维)
            </option>
          </select>
          <div class="form-hint">嵌入模型用于将文本转换为向量，支持语义搜索。创建后不可更改。</div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn" @click="handleCancel">取消</button>
          <button type="submit" class="btn-primary" :disabled="!isValid || loadingModels">
            创建
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.form-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 500px;
  box-shadow: var(--theme-shadow);
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.form-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text);
}

.form-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

.form-actions.with-border {
  padding-top: 20px;
}
</style>
