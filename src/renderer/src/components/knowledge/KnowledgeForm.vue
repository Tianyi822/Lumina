<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'
import styles from './KnowledgeForm.module.css'

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
  <div :class="['sm-modal__overlay', styles['form-overlay']]" @click.self="handleCancel">
    <div :class="['sm-modal__surface', styles['form-container']]">
      <div :class="['sm-pane-header', styles['form-header']]">
        <h2>创建知识库</h2>
        <button class="sm-icon-button close-btn" @click="handleCancel">✕</button>
      </div>

      <form :class="styles['form-body']" @submit.prevent="handleSubmit">
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
          <div :class="['form-hint', styles['form-hint']]">
            嵌入模型用于将文本转换为向量，支持语义搜索。创建后不可更改。
          </div>
        </div>

        <!-- 分块策略配置 -->
        <div class="form-group">
          <label>分块策略</label>
          <div :class="styles['strategy-options']">
            <label
              v-for="(strategy, index) in chunkStrategies"
              :key="index"
              :class="[
                styles['strategy-option'],
                { [styles.active]: !useCustomChunk && chunkStrategy === index }
              ]"
            >
              <input
                v-model="chunkStrategy"
                type="radio"
                name="chunk-strategy"
                :value="index"
                :checked="!useCustomChunk && chunkStrategy === index"
                @click="useCustomChunk = false"
              />
              <div :class="styles['strategy-info']">
                <div :class="styles['strategy-name']">{{ strategy.name }}</div>
                <div :class="styles['strategy-params']">
                  {{ strategy.size }} tokens / {{ strategy.overlap }} overlap
                </div>
                <div :class="styles['strategy-desc']">{{ strategy.desc }}</div>
              </div>
            </label>
            <label :class="[styles['strategy-option'], { [styles.active]: useCustomChunk }]">
              <input
                type="radio"
                name="chunk-strategy"
                :checked="useCustomChunk"
                @click="useCustomChunk = true"
              />
              <div :class="styles['strategy-info']">
                <div :class="styles['strategy-name']">自定义</div>
                <div v-if="!useCustomChunk" :class="styles['strategy-desc']">手动设置分块参数</div>
                <div v-else :class="styles['custom-inputs']">
                  <div :class="styles['custom-input']">
                    <label>块大小</label>
                    <input
                      v-model.number="customChunkSize"
                      type="number"
                      min="100"
                      max="8000"
                      step="100"
                      class="sm-input"
                    />
                    <span :class="styles['unit']">tokens</span>
                  </div>
                  <div :class="styles['custom-input']">
                    <label>重叠大小</label>
                    <input
                      v-model.number="customChunkOverlap"
                      type="number"
                      min="0"
                      max="2000"
                      step="50"
                      class="sm-input"
                    />
                    <span :class="styles['unit']">tokens</span>
                  </div>
                </div>
              </div>
            </label>
          </div>
          <div :class="['form-hint', styles['form-hint']]">
            文本分块策略影响检索精度，创建后不可更改。
          </div>
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
