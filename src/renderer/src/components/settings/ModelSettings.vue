<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { LLMConfig } from '@renderer/types'

interface Props {
  modelConfigs: LLMConfig[]
  defaultModel: string
}

interface Emits {
  (e: 'update:modelConfigs', value: LLMConfig[]): void
  (e: 'update:defaultModel', value: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 展开的模型配置项（使用 model_name 作为 key）
const expandedModels = ref<Set<string>>(new Set())

// 新模型表单
const showNewModelForm = ref(false)
const newModelConfig = reactive<LLMConfig>({
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096
})

function addNewModel(): void {
  if (!newModelConfig.base_url.trim()) {
    return
  }
  if (!newModelConfig.api_key.trim()) {
    return
  }
  if (!newModelConfig.model_name.trim()) {
    return
  }

  const newConfigs = [...props.modelConfigs, { ...newModelConfig }]
  emit('update:modelConfigs', newConfigs)

  // 如果是第一个模型，设为默认
  if (newConfigs.length === 1) {
    emit('update:defaultModel', newModelConfig.model_name)
  }

  resetNewModelForm()
}

function resetNewModelForm(): void {
  showNewModelForm.value = false
  newModelConfig.base_url = ''
  newModelConfig.api_key = ''
  newModelConfig.model_name = ''
  newModelConfig.temperature = 0.7
  newModelConfig.max_tokens = 4096
}

function deleteModel(modelName: string): void {
  const newConfigs = props.modelConfigs.filter((m) => m.model_name !== modelName)
  emit('update:modelConfigs', newConfigs)

  expandedModels.value.delete(modelName)
  if (props.defaultModel === modelName) {
    emit('update:defaultModel', newConfigs.length > 0 ? newConfigs[0].model_name : '')
  }
}

function toggleModelExpand(modelName: string): void {
  if (expandedModels.value.has(modelName)) {
    expandedModels.value.delete(modelName)
  } else {
    expandedModels.value.add(modelName)
  }
}

function setDefaultModel(modelName: string): void {
  emit('update:defaultModel', modelName)
}

function updateModelConfig(modelName: string, field: keyof LLMConfig, value: unknown): void {
  const newConfigs = props.modelConfigs.map((m) =>
    m.model_name === modelName ? { ...m, [field]: value } : m
  )
  emit('update:modelConfigs', newConfigs)
}
</script>

<template>
  <div class="tab-content">
    <!-- 已配置的模型列表 -->
    <div class="model-list">
      <div v-for="config in modelConfigs" :key="config.model_name" class="model-item">
        <div class="model-header" @click="toggleModelExpand(config.model_name)">
          <span class="model-name">{{ config.model_name }}</span>
          <span v-if="defaultModel === config.model_name" class="default-badge">默认</span>
          <span class="expand-state">{{ expandedModels.has(config.model_name) ? '收起' : '展开' }}</span>
          <div class="model-actions">
            <button
              v-if="defaultModel !== config.model_name"
              class="btn btn-small"
              @click.stop="setDefaultModel(config.model_name)"
            >
              设为默认
            </button>
            <button
              class="btn btn-small btn-danger-text"
              @click.stop="deleteModel(config.model_name)"
            >
              删除
            </button>
          </div>
        </div>
        <div v-if="expandedModels.has(config.model_name)" class="model-details">
          <div class="form-group">
            <label>API Base URL</label>
            <input
              :value="config.base_url"
              type="text"
              class="input"
              placeholder="https://api.openai.com/v1"
              @input="
                (e) =>
                  updateModelConfig(
                    config.model_name,
                    'base_url',
                    (e.target as HTMLInputElement).value
                  )
              "
            />
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input
              :value="config.api_key"
              type="password"
              class="input"
              placeholder="sk-..."
              @input="
                (e) =>
                  updateModelConfig(
                    config.model_name,
                    'api_key',
                    (e.target as HTMLInputElement).value
                  )
              "
            />
          </div>
          <div class="form-group">
            <label>模型名称</label>
            <input
              :value="config.model_name"
              type="text"
              class="input"
              placeholder="gpt-4"
              @input="
                (e) =>
                  updateModelConfig(
                    config.model_name,
                    'model_name',
                    (e.target as HTMLInputElement).value
                  )
              "
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
                @input="
                  (e) =>
                    updateModelConfig(
                      config.model_name,
                      'temperature',
                      Number((e.target as HTMLInputElement).value)
                    )
                "
              />
            </div>
            <div class="form-group half">
              <label>Max Tokens</label>
              <input
                :value="config.max_tokens"
                type="number"
                class="input"
                min="1"
                @input="
                  (e) =>
                    updateModelConfig(
                      config.model_name,
                      'max_tokens',
                      Number((e.target as HTMLInputElement).value)
                    )
                "
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="modelConfigs.length === 0 && !showNewModelForm" class="empty-state">
        <p>暂无模型配置</p>
      </div>
    </div>

    <!-- 添加新模型表单 -->
    <div v-if="showNewModelForm" class="new-model-form">
      <h3 class="form-section-title">添加新模型配置</h3>
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
        <input v-model="newModelConfig.model_name" type="text" class="input" placeholder="gpt-4" />
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
          <input v-model.number="newModelConfig.max_tokens" type="number" class="input" min="1" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" @click="resetNewModelForm">取消</button>
        <button class="btn-primary" @click="addNewModel">添加</button>
      </div>
    </div>

    <!-- 添加模型按钮 -->
    <button v-if="!showNewModelForm" class="btn add-model-btn" @click="showNewModelForm = true">
      添加模型配置
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

.model-name {
  font-weight: 500;
  color: var(--theme-text);
  flex: 1;
}

.expand-state {
  font-size: 12px;
  color: var(--theme-text-tertiary);
  margin-right: 12px;
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

/* 覆盖全局样式的特定变体 */
.form-group label {
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
