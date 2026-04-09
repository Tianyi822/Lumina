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
    window.api.logger.error('[KnowledgeForm] 加载嵌入模型失败', {
      error: error instanceof Error ? error.message : String(error)
    })
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
  <div class="sm-modal__overlay form-overlay" @click.self="handleCancel">
    <div class="sm-modal__surface form-container">
      <div class="sm-pane-header form-header">
        <h2>创建知识库</h2>
        <button class="sm-icon-button close-btn" @click="handleCancel">✕</button>
      </div>

      <form class="form-body" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="kb-name">知识库名称 *</label>
          <input
            id="kb-name"
            v-model="name"
            type="text"
            class="sm-input"
            placeholder="例如：产品文档、技术规范..."
            required
          />
        </div>

        <div class="form-group">
          <label for="kb-description">描述（可选）</label>
          <textarea
            id="kb-description"
            v-model="description"
            class="sm-textarea"
            rows="3"
            placeholder="简要描述这个知识库的用途..."
          />
        </div>

        <div class="form-group">
          <label for="kb-model">嵌入模型 *</label>
          <select
            id="kb-model"
            v-model="embeddingModel"
            class="sm-select"
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
                      class="sm-input"
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
                      class="sm-input"
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
          <button type="button" class="sm-button sm-button--secondary" @click="handleCancel">
            取消
          </button>
          <button
            type="submit"
            class="sm-button sm-button--primary"
            :disabled="!isValid || loadingModels"
          >
            创建
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.form-overlay {
  z-index: 1000;
}

.form-container {
  width: 100%;
  max-width: 640px;
  max-height: min(760px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.form-header {
  flex-shrink: 0;
}

.form-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.form-body {
  padding: var(--sm-space-5);
}

.form-hint {
  color: var(--sm-color-text-secondary);
}

.form-actions.with-border {
  padding-top: var(--sm-space-4);
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.strategy-option {
  display: flex;
  align-items: flex-start;
  gap: var(--sm-space-3);
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.strategy-option:hover {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-strong);
}

.strategy-option.active {
  border-color: var(--sm-color-border-selected);
  background: var(--sm-color-surface-selected);
}

.strategy-option input[type='radio'] {
  margin-top: 3px;
  flex-shrink: 0;
  accent-color: var(--sm-color-accent);
}

.strategy-info {
  flex: 1;
}

.strategy-name {
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.strategy-params {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  font-family: var(--sm-font-mono);
  margin-bottom: 4px;
}

.strategy-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.custom-inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sm-space-3);
  margin-top: var(--sm-space-3);
}

.custom-input {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px var(--sm-space-2);
  align-items: center;
}

.custom-input label {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  margin: 0;
}

.custom-input :deep(.sm-input) {
  min-width: 0;
}

.custom-input .unit {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  font-family: var(--sm-font-mono);
}

@media (max-width: 720px) {
  .form-container {
    max-width: none;
  }

  .form-body {
    padding: var(--sm-space-4);
  }

  .custom-inputs {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
