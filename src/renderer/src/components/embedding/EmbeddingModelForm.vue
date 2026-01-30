<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'

interface Props {
  existingNames?: string[]
  editingName?: string
  editingConfig?: EmbeddingConfig | null
}

interface Emits {
  (e: 'submit', name: string, config: EmbeddingConfig): void
  (e: 'cancel'): void
  (e: 'test', config: EmbeddingConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 表单数据
const displayName = ref('')
const baseUrl = ref('')
const apiKey = ref('')
const modelName = ref('')
const dimensions = ref('1536')
const enabled = ref(true)

// 名称冲突提示
const nameConflictError = ref('')
const dimensionError = ref('')

const testing = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// 如果是编辑模式，加载现有配置
onMounted(() => {
  if (props.editingConfig && props.editingName) {
    displayName.value = props.editingName
    baseUrl.value = props.editingConfig.baseUrl || ''
    apiKey.value = props.editingConfig.apiKey || ''
    modelName.value = props.editingConfig.model || ''
    dimensions.value = String(props.editingConfig.dimensions || 1536)
    enabled.value = props.editingConfig.enabled !== false
  }
})

// 监听显示名称变化，检查冲突
watch(displayName, (newName) => {
  if (!newName.trim()) {
    nameConflictError.value = ''
    return
  }

  // 如果是编辑模式，不与当前编辑的名称比较
  if (props.editingName === newName) {
    nameConflictError.value = ''
    return
  }

  // 检查是否与其他模型名称冲突
  if (props.existingNames && props.existingNames.includes(newName)) {
    nameConflictError.value = '该名称已被使用，请更换'
  } else {
    nameConflictError.value = ''
  }
})

// 验证向量维度
function validateDimension(value: string): boolean {
  const num = Number(value)
  if (!value.trim()) {
    dimensionError.value = '请输入向量维度'
    return false
  }
  if (isNaN(num)) {
    dimensionError.value = '请输入有效的数字'
    return false
  }
  if (!Number.isInteger(num)) {
    dimensionError.value = '向量维度必须是整数'
    return false
  }
  if (num <= 0) {
    dimensionError.value = '向量维度必须大于0'
    return false
  }
  dimensionError.value = ''
  return true
}

// 验证表单
function validateForm(): string | null {
  if (!displayName.value.trim()) {
    return '请输入显示名称'
  }
  if (nameConflictError.value) {
    return nameConflictError.value
  }
  if (!baseUrl.value.trim()) {
    return '请输入API基础URL'
  }
  if (!apiKey.value.trim()) {
    return '请输入API密钥'
  }
  if (!modelName.value.trim()) {
    return '请输入模型名称'
  }
  if (!validateDimension(dimensions.value)) {
    return dimensionError.value
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
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: modelName.value.trim(),
    dimensions: parseInt(dimensions.value, 10),
    enabled: enabled.value,
    displayName: displayName.value.trim(),
    createdAt: props.editingConfig?.createdAt || new Date().toISOString()
  }

  emit('submit', displayName.value.trim(), config)
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
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: modelName.value.trim(),
    dimensions: parseInt(dimensions.value, 10),
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
</script>

<template>
  <div class="form-container">
    <h3>{{ editingName ? '编辑' : '添加' }}嵌入模型</h3>

    <form @submit.prevent="handleSubmit">
      <!-- 显示名称 -->
      <div class="form-group">
        <label class="form-label">显示名称 *</label>
        <input
          v-model="displayName"
          type="text"
          class="form-input"
          :class="{ 'input-error': nameConflictError }"
          placeholder="例如: OpenAI Embedding Small"
          required
        />
        <span v-if="nameConflictError" class="error-message">{{ nameConflictError }}</span>
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
      <div class="form-group">
        <label class="form-label">API 密钥 *</label>
        <input v-model="apiKey" type="password" class="form-input" placeholder="sk-..." required />
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
        <input
          v-model="dimensions"
          type="text"
          class="form-input"
          :class="{ 'input-error': dimensionError }"
          placeholder="1536"
          @input="validateDimension(dimensions)"
          required
        />
        <span v-if="dimensionError" class="error-message">{{ dimensionError }}</span>
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

.input-error {
  border-color: #f44336 !important;
}

.error-message {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #f44336;
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
