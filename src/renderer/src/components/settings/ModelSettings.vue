<script setup lang="ts">
import { ref, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import type { LLMConfig } from '@renderer/types'
import { useConfigStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores'

const configStore = useConfigStore()
const uiStateStore = useUIStateStore()
const { llmConfigs, defaultModel, saving } = storeToRefs(configStore)

// 展开的模型配置项（使用索引避免编辑 model_name 时丢失展开状态）
const expandedModels = ref<Set<number>>(new Set())
const autoSavePending = ref(false)
const autoSaveRunning = ref(false)

const MODEL_FIELD_LABELS: Record<'base_url' | 'api_key' | 'model_name', string> = {
  base_url: 'API Base URL',
  api_key: 'API Key',
  model_name: '模型名称'
}

// 新模型表单
const showNewModelForm = ref(false)
const newModelConfig = reactive<LLMConfig>({
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096
})

function showValidationWarning(message: string): void {
  configStore.successMessage = ''
  configStore.errorMessage = message
}

function getModelItemName(config: LLMConfig, index: number): string {
  return config.model_name.trim() || `第 ${index + 1} 个模型`
}

function validateModelConfig(config: LLMConfig, index: number): string {
  const requiredFields: Array<keyof typeof MODEL_FIELD_LABELS> = ['base_url', 'api_key', 'model_name']

  for (const field of requiredFields) {
    if (!config[field].trim()) {
      return `模型配置“${getModelItemName(config, index)}”的 ${MODEL_FIELD_LABELS[field]} 不能为空`
    }
  }

  return ''
}

function validateAllModelConfigs(): boolean {
  for (const [index, config] of llmConfigs.value.entries()) {
    const validationMessage = validateModelConfig(config, index)
    if (validationMessage) {
      showValidationWarning(validationMessage)
      return false
    }
  }

  return true
}

function addNewModel(): void {
  const validationMessage = validateModelConfig(newModelConfig, llmConfigs.value.length)
  if (validationMessage) {
    showValidationWarning(validationMessage)
    return
  }

  const newConfigs = [...llmConfigs.value, { ...newModelConfig }]
  configStore.updateLLMConfigs(newConfigs)
  expandedModels.value.add(newConfigs.length - 1)

  // 如果是第一个模型，设为默认
  if (newConfigs.length === 1) {
    configStore.updateDefaultModel(newModelConfig.model_name)
  }

  triggerAutoSave()
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

function normalizeExpandedModelsAfterDelete(deletedIndex: number): void {
  expandedModels.value = new Set(
    Array.from(expandedModels.value)
      .filter((index) => index !== deletedIndex)
      .map((index) => (index > deletedIndex ? index - 1 : index))
  )
}

function deleteModel(modelIndex: number): void {
  const modelName = llmConfigs.value[modelIndex]?.model_name
  if (modelName === undefined) {
    return
  }

  const newConfigs = llmConfigs.value.filter((_, index) => index !== modelIndex)
  configStore.updateLLMConfigs(newConfigs)

  normalizeExpandedModelsAfterDelete(modelIndex)
  if (defaultModel.value === modelName) {
    configStore.updateDefaultModel(newConfigs.length > 0 ? newConfigs[0].model_name : '')
  }

  triggerAutoSave()
}

function toggleModelExpand(modelIndex: number): void {
  if (expandedModels.value.has(modelIndex)) {
    expandedModels.value.delete(modelIndex)
  } else {
    expandedModels.value.add(modelIndex)
  }
}

function setDefaultModel(modelName: string): void {
  if (defaultModel.value === modelName) {
    return
  }

  configStore.updateDefaultModel(modelName)
  triggerAutoSave()
}

function updateModelConfig(modelIndex: number, field: keyof LLMConfig, value: unknown): void {
  const currentConfig = llmConfigs.value[modelIndex]
  if (!currentConfig || currentConfig[field] === value) {
    return
  }

  const newConfigs = [...llmConfigs.value]
  newConfigs[modelIndex] = {
    ...currentConfig,
    [field]: value
  } as LLMConfig

  configStore.updateLLMConfigs(newConfigs)

  if (
    field === 'model_name' &&
    defaultModel.value === currentConfig.model_name &&
    typeof value === 'string'
  ) {
    configStore.updateDefaultModel(value)
  }

  triggerAutoSave()
}

async function flushAutoSaveQueue(): Promise<void> {
  if (autoSaveRunning.value) {
    autoSavePending.value = true
    return
  }

  autoSaveRunning.value = true
  let shouldNotify = false

  try {
    do {
      autoSavePending.value = false
      if (!validateAllModelConfigs()) {
        return
      }

      const success = await configStore.saveConfig({ silent: true })
      if (success) {
        shouldNotify = true
      }
    } while (autoSavePending.value)
  } finally {
    autoSaveRunning.value = false
  }

  if (shouldNotify) {
    uiStateStore.notifyConfigUpdate()
  }
}

function triggerAutoSave(): void {
  void flushAutoSaveQueue()
}

// 保存配置
async function handleSave(): Promise<void> {
  if (!validateAllModelConfigs()) {
    return
  }

  const success = await configStore.saveConfig()
  if (success) {
    uiStateStore.notifyConfigUpdate()
  }
}
</script>

<template>
  <div class="tab-content">
    <!-- 已配置的模型列表 -->
    <div class="model-list">
      <div v-for="(config, index) in llmConfigs" :key="index" class="model-item">
        <div class="model-header" @click="toggleModelExpand(index)">
          <span class="model-name">{{ config.model_name || '未命名模型' }}</span>
          <span v-if="defaultModel === config.model_name" class="default-badge">默认</span>
          <span class="expand-state">{{
            expandedModels.has(index) ? '收起' : '展开'
          }}</span>
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
              @click.stop="deleteModel(index)"
            >
              删除
            </button>
          </div>
        </div>
        <div v-if="expandedModels.has(index)" class="model-details">
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
                    index,
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
                    index,
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
                    index,
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
                      index,
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
                      index,
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
      <div v-if="llmConfigs.length === 0 && !showNewModelForm" class="empty-state">
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

    <!-- 保存配置按钮 -->
    <div class="save-actions">
      <button class="btn-primary" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
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

.save-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
