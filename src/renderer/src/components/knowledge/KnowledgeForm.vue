<script setup lang="ts">
import { ref, computed } from 'vue'

// 可用的嵌入模型列表
const embeddingModels = [
  { id: 'openai/small', name: 'OpenAI text-embedding-3-small', dimension: 1536 },
  { id: 'openai/large', name: 'OpenAI text-embedding-3-large', dimension: 3072 },
  { id: 'ollama/nomic', name: 'Ollama nomic-embed-text', dimension: 768 }
]

const emit = defineEmits<{
  (e: 'submit', data: { name: string; description: string; embeddingModel: string }): void
  (e: 'cancel'): void
}>()

// 表单数据
const name = ref('')
const description = ref('')
const embeddingModel = ref('openai/small')

// 验证
const isValid = computed(() => {
  return name.value.trim().length > 0
})

function handleSubmit(): void {
  if (!isValid.value) return
  emit('submit', {
    name: name.value.trim(),
    description: description.value.trim(),
    embeddingModel: embeddingModel.value
  })
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
          <select id="kb-model" v-model="embeddingModel" class="input select">
            <option v-for="model in embeddingModels" :key="model.id" :value="model.id">
              {{ model.name }} ({{ model.dimension }} 维)
            </option>
          </select>
          <div class="form-hint">
            嵌入模型用于将文本转换为向量，支持语义搜索。创建后不可更改。
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn" @click="handleCancel">取消</button>
          <button type="submit" class="btn-primary" :disabled="!isValid">创建</button>
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
</style>
