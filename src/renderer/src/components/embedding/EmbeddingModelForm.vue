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
const provider = ref<'openai' | 'aliyun' | 'ollama' | 'custom'>('custom')
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
    provider.value = props.editingConfig.provider || 'custom'
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
    provider: provider.value,
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
    provider: provider.value,
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
  <div class="new-model-form">
    <h3 class="form-section-title">{{ editingName ? '编辑' : '添加' }}嵌入模型</h3>

    <form @submit.prevent="handleSubmit">
      <!-- 显示名称 -->
      <div class="form-group">
        <label>显示名称 <span class="required">*</span></label>
        <input
          v-model="displayName"
          type="text"
          class="input"
          :class="{ 'input-error': nameConflictError }"
          placeholder="例如: OpenAI Embedding Small"
          required
        />
        <span v-if="nameConflictError" class="error-message">{{ nameConflictError }}</span>
      </div>

      <!-- API 基础URL -->
      <div class="form-group">
        <label>API 基础URL <span class="required">*</span></label>
        <input
          v-model="baseUrl"
          type="url"
          class="input"
          placeholder="https://api.openai.com/v1"
          required
        />
      </div>

      <!-- API 密钥 -->
      <div class="form-group">
        <label>API 密钥 <span class="required">*</span></label>
        <input v-model="apiKey" type="password" class="input" placeholder="sk-..." required />
      </div>

      <!-- 模型名称 -->
      <div class="form-group">
        <label>模型名称 <span class="required">*</span></label>
        <input
          v-model="modelName"
          type="text"
          class="input"
          placeholder="text-embedding-3-small"
          required
        />
      </div>

      <!-- 向量维度 -->
      <div class="form-group">
        <label>向量维度 <span class="required">*</span></label>
        <input
          v-model="dimensions"
          type="text"
          class="input"
          :class="{ 'input-error': dimensionError }"
          placeholder="1536"
          required
          @input="validateDimension(dimensions)"
        />
        <span v-if="dimensionError" class="error-message">{{ dimensionError }}</span>
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" class="test-result" :class="testResult.type">
        {{ testResult.message }}
      </div>

      <!-- 按钮组 -->
      <div class="form-actions">
        <button type="button" class="btn" @click="emit('cancel')">取消</button>
        <button type="button" class="btn" :disabled="testing" @click="handleTestConnection">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.new-model-form {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.form-group label {
  color: var(--theme-text-secondary);
}

.required {
  color: var(--theme-danger);
}

.input-error {
  border-color: var(--theme-danger) !important;
}

.error-message {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--theme-danger);
}

.test-result {
  padding: 8px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 16px;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.15);
  color: var(--theme-success);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--theme-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
</style>
