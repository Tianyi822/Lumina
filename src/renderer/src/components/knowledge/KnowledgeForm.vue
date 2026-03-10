<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'

// 可用的嵌入模型列表
const embeddingModels = ref<Record<string, EmbeddingConfig>>({})
const loadingModels = ref(true)

// 预设的分块策略
const chunkStrategies = [
  { name: '精细检索', size: 500, overlap: 100, desc: '适合代码、法律条文，精确匹配' },
  { name: '平衡模式', size: 1000, overlap: 200, desc: '通用场景，推荐' },
  { name: '长上下文', size: 2000, overlap: 400, desc: '适合论文、小说，保持段落完整' }
]

const emit = defineEmits<{
  (
    e: 'submit',
    data: {
      name: string
      description: string
      embeddingConfig: {
        baseUrl: string
        apiKey?: string
        displayName?: string
        model: string
        dimensions: number
      }
      embeddingDimension: number
      chunkSize: number
      chunkOverlap: number
    }
  ): void
  (e: 'cancel'): void
}>()

// 表单数据
const name = ref('')
const description = ref('')
const embeddingModel = ref('')
const chunkStrategy = ref(1) // 默认选中平衡模式
const customChunkSize = ref(1000)
const customChunkOverlap = ref(200)
const useCustomChunk = ref(false)

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

  // 计算 chunk 配置
  let chunkSize: number
  let chunkOverlap: number

  if (useCustomChunk.value) {
    chunkSize = customChunkSize.value
    chunkOverlap = customChunkOverlap.value
  } else {
    const strategy = chunkStrategies[chunkStrategy.value]
    chunkSize = strategy.size
    chunkOverlap = strategy.overlap
  }

  const config = selectedModelConfig.value

  const data = {
    name: name.value.trim(),
    description: description.value.trim(),
    embeddingConfig: {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      displayName: config.displayName || embeddingModel.value,
      model: config.model,
      dimensions: config.dimensions
    },
    embeddingDimension: config.dimensions,
    chunkSize,
    chunkOverlap
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
  chunkStrategy.value = 1
  customChunkSize.value = 1000
  customChunkOverlap.value = 200
  useCustomChunk.value = false
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

        <!-- 分块策略配置 -->
        <div class="form-group">
          <label>分块策略</label>
          <div class="strategy-options">
            <label
              v-for="(strategy, index) in chunkStrategies"
              :key="index"
              class="strategy-option"
              :class="{ active: !useCustomChunk && chunkStrategy === index }"
            >
              <input
                v-model="chunkStrategy"
                type="radio"
                name="chunk-strategy"
                :value="index"
                :checked="!useCustomChunk && chunkStrategy === index"
                @click="useCustomChunk = false"
              />
              <div class="strategy-info">
                <div class="strategy-name">{{ strategy.name }}</div>
                <div class="strategy-params">
                  {{ strategy.size }} tokens / {{ strategy.overlap }} overlap
                </div>
                <div class="strategy-desc">{{ strategy.desc }}</div>
              </div>
            </label>
            <label class="strategy-option" :class="{ active: useCustomChunk }">
              <input
                type="radio"
                name="chunk-strategy"
                :checked="useCustomChunk"
                @click="useCustomChunk = true"
              />
              <div class="strategy-info">
                <div class="strategy-name">自定义</div>
                <div v-if="!useCustomChunk" class="strategy-desc">手动设置分块参数</div>
                <div v-else class="custom-inputs">
                  <div class="custom-input">
                    <label>块大小</label>
                    <input
                      v-model.number="customChunkSize"
                      type="number"
                      min="100"
                      max="8000"
                      step="100"
                      class="input"
                    />
                    <span class="unit">tokens</span>
                  </div>
                  <div class="custom-input">
                    <label>重叠大小</label>
                    <input
                      v-model.number="customChunkOverlap"
                      type="number"
                      min="0"
                      max="2000"
                      step="50"
                      class="input"
                    />
                    <span class="unit">tokens</span>
                  </div>
                </div>
              </div>
            </label>
          </div>
          <div class="form-hint">文本分块策略影响检索精度，创建后不可更改。</div>
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
  max-height: calc(100vh - 40px);
  overflow-y: auto;
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

/* 分块策略选项样式 */
.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strategy-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.strategy-option:hover {
  background-color: var(--theme-bg-hover);
}

.strategy-option.active {
  border-color: var(--theme-primary);
  background-color: rgba(var(--theme-primary-rgb), 0.1);
}

.strategy-option input[type='radio'] {
  margin-top: 2px;
  flex-shrink: 0;
}

.strategy-info {
  flex: 1;
}

.strategy-name {
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 2px;
}

.strategy-params {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 2px;
}

.strategy-desc {
  font-size: 11px;
  color: var(--theme-text-secondary);
  opacity: 0.8;
}

.custom-inputs {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.custom-input {
  display: flex;
  align-items: center;
  gap: 6px;
}

.custom-input label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin: 0;
}

.custom-input .input {
  width: 80px;
  padding: 4px 8px;
  font-size: 13px;
}

.custom-input .unit {
  font-size: 12px;
  color: var(--theme-text-secondary);
}
</style>
