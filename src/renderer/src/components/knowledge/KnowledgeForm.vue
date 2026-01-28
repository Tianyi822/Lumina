<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// 可用的嵌入模型列表
const embeddingModels = ref<Record<string, { name: string; dimension: number }>>({})
const loadingModels = ref(true)

const emit = defineEmits<{
  (e: 'submit', data: { name: string; description: string; embeddingModel: string; customConfig?: {
    modelName: string
    baseUrl: string
    dimension: number
  } }): void
  (e: 'cancel'): void
}>()

// 表单数据
const name = ref('')
const description = ref('')
const embeddingModel = ref('openai/small')

// 自定义模型配置
const customModelName = ref('')
const customBaseUrl = ref('')
const customDimension = ref(1536)

// 加载预设模型列表
onMounted(async () => {
  try {
    const result = await window.api.embedding.getPresets()
    if (result.success && result.data) {
      embeddingModels.value = result.data
    }
  } catch (error) {
    console.error('加载预设模型失败:', error)
  } finally {
    loadingModels.value = false
  }
})

// 计算是否显示自定义配置
const showCustomConfig = computed(() => embeddingModel.value === 'custom')

// 验证
const isValid = computed(() => {
  if (name.value.trim().length === 0) return false

  if (showCustomConfig.value) {
    return (
      customModelName.value.trim().length > 0 &&
      customBaseUrl.value.trim().length > 0 &&
      customDimension.value > 0
    )
  }

  return true
})

function handleSubmit(): void {
  if (!isValid.value) return

  const data: {
    name: string
    description: string
    embeddingModel: string
    customConfig?: {
      modelName: string
      baseUrl: string
      dimension: number
    }
  } = {
    name: name.value.trim(),
    description: description.value.trim(),
    embeddingModel: embeddingModel.value
  }

  // 如果是自定义模型，添加自定义配置
  if (showCustomConfig.value) {
    data.embeddingModel = `custom:${customModelName.value}`
    data.customConfig = {
      modelName: customModelName.value.trim(),
      baseUrl: customBaseUrl.value.trim(),
      dimension: customDimension.value
    }
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
  embeddingModel.value = 'openai/small'
  customModelName.value = ''
  customBaseUrl.value = ''
  customDimension.value = 1536
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
          <select id="kb-model" v-model="embeddingModel" class="input select" :disabled="loadingModels">
            <option v-if="loadingModels" value="" disabled>加载中...</option>
            <option v-for="(model, id) in embeddingModels" :key="id" :value="id">
              {{ model.name }} ({{ model.dimension }} 维)
            </option>
            <option value="custom">自定义</option>
          </select>
          <div class="form-hint">
            嵌入模型用于将文本转换为向量，支持语义搜索。创建后不可更改。
          </div>
        </div>

        <!-- 自定义模型配置 -->
        <template v-if="showCustomConfig">
          <div class="custom-config-section">
            <div class="form-group">
              <label for="custom-model-name">模型名称 *</label>
              <input
                id="custom-model-name"
                v-model="customModelName"
                type="text"
                class="input"
                placeholder="例如: jina-embeddings-v2"
                required
              />
            </div>

            <div class="form-group">
              <label for="custom-base-url">API 基础 URL *</label>
              <input
                id="custom-base-url"
                v-model="customBaseUrl"
                type="text"
                class="input"
                placeholder="例如: https://api.example.com/v1"
                required
              />
              <div class="form-hint">
                第三方嵌入模型的 API 地址
              </div>
            </div>

            <div class="form-group">
              <label for="custom-dimension">向量维度 *</label>
              <input
                id="custom-dimension"
                v-model.number="customDimension"
                type="number"
                class="input"
                placeholder="例如: 1536"
                min="1"
                step="1"
                required
              />
              <div class="form-hint">
                嵌入向量返回的维度数量
              </div>
            </div>
          </div>
        </template>

        <div class="form-actions">
          <button type="button" class="btn" @click="handleCancel">取消</button>
          <button type="submit" class="btn-primary" :disabled="!isValid || loadingModels">创建</button>
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

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 8px;
}

.textarea {
  resize: vertical;
  min-height: 80px;
  font-family: var(--theme-font);
}

.select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b949e' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--theme-border);
}

.btn:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.custom-config-section {
  background-color: var(--theme-bg-hover);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.custom-config-section .form-group {
  margin-bottom: 16px;
}

.custom-config-section .form-group:last-child {
  margin-bottom: 0;
}
</style>
