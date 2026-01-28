<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { EmbeddingConfig, EmbeddingProviderType } from '@shared/types/config'

interface Props {
  existingIds?: string[]
}

interface Emits {
  (e: 'submit', id: string, config: EmbeddingConfig): void
  (e: 'cancel'): void
  (e: 'test', config: EmbeddingConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 表单数据
const modelId = ref('')
const displayName = ref('')
const provider = ref<EmbeddingProviderType>('openai')
const baseUrl = ref('')
const apiKey = ref('')
const modelName = ref('')
const dimensions = ref(1536)
const enabled = ref(true)

// 预设配置
const presets: Record<string, Partial<EmbeddingConfig>> = {
  'openai-text-embedding-3-small': {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small',
    dimensions: 1536
  },
  'openai-text-embedding-3-large': {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'text-embedding-3-large',
    dimensions: 3072
  },
  'aliyun-text-embedding-v2': {
    provider: 'aliyun',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'text-embedding-v2',
    dimensions: 1536
  },
  'ollama-nomic-embed-text': {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'nomic-embed-text',
    dimensions: 768
  },
  'ollama-mxbai-embed-large': {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'mxbai-embed-large',
    dimensions: 1024
  }
}

const testing = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// 根据提供商更新默认配置
function updateProviderDefaults(): void {
  const preset = presets[`${provider.value}-${modelName.value}`]
  if (preset) {
    baseUrl.value = preset.baseUrl || ''
    dimensions.value = preset.dimensions || 1536
  } else {
    // 根据提供商设置默认 baseUrl
    switch (provider.value) {
      case 'openai':
        baseUrl.value = 'https://api.openai.com/v1'
        break
      case 'aliyun':
        baseUrl.value = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        break
      case 'ollama':
        baseUrl.value = 'http://localhost:11434/v1'
        break
      case 'custom':
        baseUrl.value = ''
        break
    }
  }
}

// 监听提供商变化
function onProviderChange(): void {
  updateProviderDefaults()
}

// 验证表单
function validateForm(): string | null {
  if (!modelId.value.trim()) {
    return '请输入模型ID'
  }
  if (props.existingIds && props.existingIds.includes(modelId.value)) {
    return '模型ID已存在'
  }
  if (!displayName.value.trim()) {
    return '请输入显示名称'
  }
  if (!baseUrl.value.trim()) {
    return '请输入API基础URL'
  }
  if (provider.value !== 'ollama' && !apiKey.value.trim()) {
    return '请输入API密钥'
  }
  if (!modelName.value.trim()) {
    return '请输入模型名称'
  }
  if (dimensions.value <= 0) {
    return '向量维度必须大于0'
  }
  return null
}

// 提交表单
function handleSubmit(): void {
  const error = validateForm()
  if (error) {
    testResult.value = { type: 'error', message: error }
    return
  }

  const config: EmbeddingConfig = {
    provider: provider.value,
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim() || undefined,
    model: modelName.value.trim(),
    dimensions: dimensions.value,
    enabled: enabled.value,
    displayName: displayName.value.trim(),
    createdAt: new Date().toISOString()
  }

  emit('submit', modelId.value.trim(), config)
}

// 测试连接
async function handleTestConnection(): Promise<void> {
  const error = validateForm()
  if (error) {
    testResult.value = { type: 'error', message: error }
    return
  }

  testing.value = true
  testResult.value = null

  const config: EmbeddingConfig = {
    provider: provider.value,
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim() || undefined,
    model: modelName.value.trim(),
    dimensions: dimensions.value,
    enabled: enabled.value,
    displayName: displayName.value.trim(),
    createdAt: new Date().toISOString()
  }

  try {
    emit('test', config)
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  updateProviderDefaults()
})
</script>

<template>
  <div class="form-container">
    <h3>添加嵌入模型</h3>

    <form @submit.prevent="handleSubmit">
      <!-- 模型ID -->
      <div class="form-group">
        <label class="form-label">模型ID *</label>
        <input
          v-model="modelId"
          type="text"
          class="form-input"
          placeholder="例如: openai-embedding-small"
          required
        />
      </div>

      <!-- 显示名称 -->
      <div class="form-group">
        <label class="form-label">显示名称 *</label>
        <input
          v-model="displayName"
          type="text"
          class="form-input"
          placeholder="例如: OpenAI Embedding Small"
          required
        />
      </div>

      <!-- 提供商 -->
      <div class="form-group">
        <label class="form-label">提供商 *</label>
        <select v-model="provider" class="form-select" @change="onProviderChange">
          <option value="openai">OpenAI</option>
          <option value="aliyun">阿里云</option>
          <option value="ollama">Ollama</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      <!-- API 基础URL -->
      <div class="form-group">
        <label class="form-label">API 基础URL *</label>
        <input
          v-model="baseUrl"
          type="url"
          class="form-input"
          placeholder="https://api.openai.com/v1"
          required
        />
      </div>

      <!-- API 密钥 -->
      <div v-if="provider !== 'ollama'" class="form-group">
        <label class="form-label">API 密钥 *</label>
        <input
          v-model="apiKey"
          type="password"
          class="form-input"
          placeholder="sk-..."
          required
        />
      </div>

      <!-- 模型名称 -->
      <div class="form-group">
        <label class="form-label">模型名称 *</label>
        <input
          v-model="modelName"
          type="text"
          class="form-input"
          placeholder="text-embedding-3-small"
          required
        />
      </div>

      <!-- 向量维度 -->
      <div class="form-group">
        <label class="form-label">向量维度 *</label>
        <input v-model.number="dimensions" type="number" class="form-input" min="1" required />
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" class="test-result" :class="testResult.type">
        {{ testResult.message }}
      </div>

      <!-- 按钮组 -->
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="emit('cancel')">取消</button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="testing"
          @click="handleTestConnection"
        >
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-container {
  padding: 20px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-background-secondary);
}

h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: var(--theme-text);
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--theme-text);
  font-weight: 500;
}

.form-input,
.form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  background: var(--theme-background);
  color: var(--theme-text);
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  background: var(--theme-background);
  color: var(--theme-text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--theme-accent);
  color: white;
  border-color: var(--theme-accent);
}

.btn-primary:hover:not(:disabled) {
  background: var(--theme-accent);
  opacity: 0.9;
}

.btn-secondary {
  background: var(--theme-background-secondary);
}

.test-result {
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
  margin-top: 16px;
}

.test-result.success {
  background: #4caf50;
  color: white;
}

.test-result.error {
  background: #f44336;
  color: white;
}
</style>
