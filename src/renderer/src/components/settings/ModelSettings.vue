<script setup lang="ts">
import { ref, reactive } from 'vue'

interface LLMConfig {
  base_url: string
  api_key: string
  model_name: string
  temperature: number
  max_tokens: number
}

interface LLMConfigs {
  [key: string]: LLMConfig
}

interface Props {
  modelConfigs: LLMConfigs
  defaultModel: string
}

interface Emits {
  (e: 'update:modelConfigs', value: LLMConfigs): void
  (e: 'update:defaultModel', value: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 展开的模型配置项
const expandedModels = ref<Set<string>>(new Set())

// 新模型表单
const showNewModelForm = ref(false)
const newModelKey = ref('')
const newModelConfig = reactive<LLMConfig>({
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096
})

function addNewModel(): void {
  if (!newModelKey.value.trim()) {
    return
  }
  if (props.modelConfigs[newModelKey.value]) {
    return
  }
  if (!newModelConfig.base_url.trim()) {
    return
  }
  if (!newModelConfig.api_key.trim()) {
    return
  }
  if (!newModelConfig.model_name.trim()) {
    return
  }

  const newConfigs = { ...props.modelConfigs }
  newConfigs[newModelKey.value] = { ...newModelConfig }
  emit('update:modelConfigs', newConfigs)

  // 如果是第一个模型，设为默认
  if (Object.keys(newConfigs).length === 1) {
    emit('update:defaultModel', newModelKey.value)
  }

  resetNewModelForm()
}

function resetNewModelForm(): void {
  showNewModelForm.value = false
  newModelKey.value = ''
  newModelConfig.base_url = ''
  newModelConfig.api_key = ''
  newModelConfig.model_name = ''
  newModelConfig.temperature = 0.7
  newModelConfig.max_tokens = 4096
}

function deleteModel(key: string): void {
  const newConfigs = { ...props.modelConfigs }
  delete newConfigs[key]
  emit('update:modelConfigs', newConfigs)

  expandedModels.value.delete(key)
  if (props.defaultModel === key) {
    const keys = Object.keys(newConfigs)
    emit('update:defaultModel', keys.length > 0 ? keys[0] : '')
  }
}

function toggleModelExpand(key: string): void {
  if (expandedModels.value.has(key)) {
    expandedModels.value.delete(key)
  } else {
    expandedModels.value.add(key)
  }
}

function setDefaultModel(key: string): void {
  emit('update:defaultModel', key)
}

function updateModelConfig(key: string, field: keyof LLMConfig, value: unknown): void {
  const newConfigs = { ...props.modelConfigs }
  if (newConfigs[key]) {
    newConfigs[key] = { ...newConfigs[key], [field]: value }
    emit('update:modelConfigs', newConfigs)
  }
}
</script>

<template>
  <div class="tab-content">
    <!-- 已配置的模型列表 -->
    <div class="model-list">
      <div v-for="(config, key) in modelConfigs" :key="key" class="model-item">
        <div class="model-header" @click="toggleModelExpand(key as string)">
          <span class="expand-icon">{{ expandedModels.has(key as string) ? '▼' : '▶' }}</span>
          <span class="model-name">{{ key }}</span>
          <span v-if="defaultModel === key" class="default-badge">默认</span>
          <div class="model-actions">
            <button
              v-if="defaultModel !== key"
              class="btn btn-small"
              @click.stop="setDefaultModel(key as string)"
            >
              设为默认
            </button>
            <button
              class="btn btn-small btn-danger-text"
              @click.stop="deleteModel(key as string)"
            >
              删除
            </button>
          </div>
        </div>
        <div v-if="expandedModels.has(key as string)" class="model-details">
          <div class="form-group">
            <label>API Base URL</label>
            <input
              :value="config.base_url"
              type="text"
              class="input"
              placeholder="https://api.openai.com/v1"
              @input="(e) => updateModelConfig(key, 'base_url', (e.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input
              :value="config.api_key"
              type="password"
              class="input"
              placeholder="sk-..."
              @input="(e) => updateModelConfig(key, 'api_key', (e.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-group">
            <label>模型名称</label>
            <input
              :value="config.model_name"
              type="text"
              class="input"
              placeholder="gpt-4"
              @input="(e) => updateModelConfig(key, 'model_name', (e.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label>Temperature</label>
              <input
                :value="config.temperature"
                type="number"
                class="input"
                min="0"
                max="2"
                step="0.1"
                @input="(e) => updateModelConfig(key, 'temperature', Number((e.target as HTMLInputElement).value))"
              />
            </div>
            <div class="form-group half">
              <label>Max Tokens</label>
              <input
                :value="config.max_tokens"
                type="number"
                class="input"
                min="1"
                @input="(e) => updateModelConfig(key, 'max_tokens', Number((e.target as HTMLInputElement).value))"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="Object.keys(modelConfigs).length === 0 && !showNewModelForm" class="empty-state">
        <p>暂无模型配置</p>
      </div>
    </div>

    <!-- 添加新模型表单 -->
    <div v-if="showNewModelForm" class="new-model-form">
      <h3 class="form-section-title">添加新模型配置</h3>
      <div class="form-group">
        <label>配置名称 <span class="required">*</span></label>
        <input
          v-model="newModelKey"
          type="text"
          class="input"
          placeholder="例如: gpt4, claude3"
        />
      </div>
      <div class="form-group">
        <label>API Base URL <span class="required">*</span></label>
        <input
          v-model="newModelConfig.base_url"
          type="text"
          class="input"
          placeholder="https://api.openai.com/v1"
        />
      </div>
      <div class="form-group">
        <label>API Key <span class="required">*</span></label>
        <input
          v-model="newModelConfig.api_key"
          type="password"
          class="input"
          placeholder="sk-..."
        />
      </div>
      <div class="form-group">
        <label>模型名称 <span class="required">*</span></label>
        <input
          v-model="newModelConfig.model_name"
          type="text"
          class="input"
          placeholder="gpt-4"
        />
      </div>
      <div class="form-row">
        <div class="form-group half">
          <label>Temperature</label>
          <input
            v-model.number="newModelConfig.temperature"
            type="number"
            class="input"
            min="0"
            max="2"
            step="0.1"
          />
        </div>
        <div class="form-group half">
          <label>Max Tokens</label>
          <input
            v-model.number="newModelConfig.max_tokens"
            type="number"
            class="input"
            min="1"
          />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" @click="resetNewModelForm">取消</button>
        <button class="btn-primary" @click="addNewModel">添加</button>
      </div>
    </div>

    <!-- 添加模型按钮 -->
    <button
      v-if="!showNewModelForm"
      class="btn add-model-btn"
      @click="showNewModelForm = true"
    >
      + 添加模型配置
    </button>
  </div>
</template>

<style scoped>
.tab-content {
  min-height: 300px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.model-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
}

.model-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.model-header:hover {
  background-color: var(--theme-bg-hover);
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
  margin-right: 10px;
  width: 12px;
}

.model-name {
  font-weight: 500;
  color: var(--theme-text);
  flex: 1;
}

.default-badge {
  font-size: 11px;
  padding: 2px 8px;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 4px;
  margin-right: 12px;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.model-details {
  padding: 16px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.required {
  color: var(--theme-danger);
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-group.half {
  flex: 1;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 20px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.form-section-title:first-child {
  margin-top: 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-border);
}

.new-model-form {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.new-model-form .form-section-title {
  margin-top: 0;
  border-bottom: none;
  padding-bottom: 0;
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

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--theme-text-secondary);
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-danger-text {
  color: var(--theme-danger);
  border-color: transparent;
}

.btn-danger-text:hover {
  background-color: rgba(248, 81, 73, 0.1);
  border-color: var(--theme-danger);
}
</style>
