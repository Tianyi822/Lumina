<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import type { LLMConfig } from '@renderer/types'
import { useConfigStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import styles from './ModelSettings.module.css'

const configStore = useZustandStore(useConfigStore)
const uiStateStore = useZustandStore(useUIStateStore)
const notify = useNotification()

// 展开的模型配置项（使用索引避免编辑 model_name 时丢失展开状态）
const expandedModels = ref<Set<number>>(new Set())
const autoSavePending = ref(false)
const autoSaveRunning = ref(false)
const testingModelIndex = ref<number | null>(null)
const testingNewModel = ref(false)

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
  model_name: ''
})

function showValidationWarning(message: string): void {
  notify.warning('模型配置校验失败', message, { source: 'settings' })
}

function getModelItemName(config: LLMConfig, index: number): string {
  return config.model_name.trim() || `第 ${index + 1} 个模型`
}

function validateModelConfig(config: LLMConfig, index: number): string {
  const requiredFields: Array<keyof typeof MODEL_FIELD_LABELS> = [
    'base_url',
    'api_key',
    'model_name'
  ]

  for (const field of requiredFields) {
    if (!config[field].trim()) {
      return `模型配置“${getModelItemName(config, index)}”的 ${MODEL_FIELD_LABELS[field]} 不能为空`
    }
  }

  return ''
}

function validateAllModelConfigs(): boolean {
  for (const [index, config] of configStore.llmConfigs.entries()) {
    const validationMessage = validateModelConfig(config, index)
    if (validationMessage) {
      showValidationWarning(validationMessage)
      return false
    }
  }

  return true
}

function addNewModel(): void {
  const validationMessage = validateModelConfig(newModelConfig, configStore.llmConfigs.length)
  if (validationMessage) {
    showValidationWarning(validationMessage)
    return
  }

  const newConfigs = [...configStore.llmConfigs, { ...newModelConfig }]
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
}

function normalizeExpandedModelsAfterDelete(deletedIndex: number): void {
  expandedModels.value = new Set(
    Array.from(expandedModels.value)
      .filter((index) => index !== deletedIndex)
      .map((index) => (index > deletedIndex ? index - 1 : index))
  )
}

function deleteModel(modelIndex: number): void {
  const modelName = configStore.llmConfigs[modelIndex]?.model_name
  if (modelName === undefined) {
    return
  }

  const newConfigs = configStore.llmConfigs.filter((_, index) => index !== modelIndex)
  configStore.updateLLMConfigs(newConfigs)

  normalizeExpandedModelsAfterDelete(modelIndex)
  if (configStore.defaultModel === modelName) {
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
  if (configStore.defaultModel === modelName) {
    return
  }

  configStore.updateDefaultModel(modelName)
  triggerAutoSave()
}

async function testModelConnection(modelIndex: number): Promise<void> {
  const config = configStore.llmConfigs[modelIndex]
  if (!config) {
    return
  }

  const validationMessage = validateModelConfig(config, modelIndex)
  if (validationMessage) {
    showValidationWarning(validationMessage)
    return
  }

  testingModelIndex.value = modelIndex
  try {
    const result = await window.api.config.testModelConnection({ ...config })
    if (result.success) {
      notify.success('模型连接测试成功', `模型“${getModelItemName(config, modelIndex)}”可用`, {
        source: 'settings'
      })
    } else {
      notify.error('模型连接测试失败', result.error || '连接测试失败', { source: 'settings' })
    }
  } catch (error) {
    notify.error('模型连接测试失败', error instanceof Error ? error.message : String(error), {
      source: 'settings'
    })
  } finally {
    testingModelIndex.value = null
  }
}

async function testNewModelConnection(): Promise<void> {
  const validationMessage = validateModelConfig(newModelConfig, configStore.llmConfigs.length)
  if (validationMessage) {
    showValidationWarning(validationMessage)
    return
  }

  testingNewModel.value = true
  try {
    const result = await window.api.config.testModelConnection({ ...newModelConfig })
    if (result.success) {
      notify.success('模型连接测试成功', `模型“${newModelConfig.model_name}”可用`, {
        source: 'settings'
      })
    } else {
      notify.error('模型连接测试失败', result.error || '连接测试失败', { source: 'settings' })
    }
  } catch (error) {
    notify.error('模型连接测试失败', error instanceof Error ? error.message : String(error), {
      source: 'settings'
    })
  } finally {
    testingNewModel.value = false
  }
}

function updateModelConfig(modelIndex: number, field: keyof LLMConfig, value: unknown): void {
  const currentConfig = configStore.llmConfigs[modelIndex]
  if (!currentConfig || currentConfig[field] === value) {
    return
  }

  const newConfigs = [...configStore.llmConfigs]
  newConfigs[modelIndex] = {
    ...currentConfig,
    [field]: value
  } as LLMConfig

  configStore.updateLLMConfigs(newConfigs)

  if (
    field === 'model_name' &&
    configStore.defaultModel === currentConfig.model_name &&
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
  <div class="sm-settings-page tab-content">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">对话模型配置</h2>
      <p class="sm-settings-page__description">
        管理对话模型列表和默认模型。修改字段后会自动同步到本地配置。
      </p>
    </header>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">模型列表</h3>
          <p class="sm-settings-page__section-description">
            当前共
            {{ configStore.llmConfigs.length }} 个模型，默认模型会同步到会话工作区的模型选择器。
          </p>
        </div>

        <span
          class="sm-settings-chip"
          :class="{ 'sm-settings-chip--accent': configStore.llmConfigs.length > 0 }"
        >
          默认模型: {{ configStore.defaultModel || '未设置' }}
        </span>
      </div>

      <div :class="styles['model-list']">
        <div
          v-for="(config, index) in configStore.llmConfigs"
          :key="index"
          :class="styles['model-item']"
        >
          <div :class="styles['model-header']" @click="toggleModelExpand(index)">
            <span :class="styles['model-name']">{{ config.model_name || '未命名模型' }}</span>
            <span
              v-if="configStore.defaultModel === config.model_name"
              :class="styles['default-badge']"
              >默认</span
            >
            <span :class="styles['expand-state']">{{
              expandedModels.has(index) ? '收起' : '展开'
            }}</span>
            <div :class="styles['model-actions']">
              <button
                class="sm-button sm-button--small"
                :disabled="testingModelIndex === index"
                @click.stop="testModelConnection(index)"
              >
                {{ testingModelIndex === index ? '测试中...' : '测试' }}
              </button>
              <button
                v-if="configStore.defaultModel !== config.model_name"
                class="sm-button sm-button--small"
                @click.stop="setDefaultModel(config.model_name)"
              >
                设为默认
              </button>
              <button
                :class="[
                  'sm-button',
                  'sm-button--small',
                  'sm-button--danger',
                  styles['model-action--danger']
                ]"
                @click.stop="deleteModel(index)"
              >
                删除
              </button>
            </div>
          </div>
          <div v-if="expandedModels.has(index)" :class="styles['model-details']">
            <div :class="styles['form-group']">
              <label>API Base URL</label>
              <input
                :value="config.base_url"
                type="text"
                class="sm-input"
                placeholder="https://api.openai.com/v1"
                @input="
                  (e) => updateModelConfig(index, 'base_url', (e.target as HTMLInputElement).value)
                "
              />
            </div>
            <div :class="styles['form-group']">
              <label>API Key</label>
              <input
                :value="config.api_key"
                type="password"
                class="sm-input"
                placeholder="sk-..."
                @input="
                  (e) => updateModelConfig(index, 'api_key', (e.target as HTMLInputElement).value)
                "
              />
            </div>
            <div :class="styles['form-group']">
              <label>模型名称</label>
              <input
                :value="config.model_name"
                type="text"
                class="sm-input"
                placeholder="gpt-4"
                @input="
                  (e) =>
                    updateModelConfig(index, 'model_name', (e.target as HTMLInputElement).value)
                "
              />
            </div>
          </div>
        </div>

        <div
          v-if="configStore.llmConfigs.length === 0 && !showNewModelForm"
          class="sm-settings-empty"
        >
          <p>暂无模型配置</p>
        </div>
      </div>

      <div v-if="showNewModelForm" :class="styles['new-model-form']">
        <h3 :class="styles['form-section-title']">添加新模型配置</h3>
        <div :class="styles['form-group']">
          <label>API Base URL <span :class="styles.required">*</span></label>
          <input
            v-model="newModelConfig.base_url"
            type="text"
            class="sm-input"
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div :class="styles['form-group']">
          <label>API Key <span :class="styles.required">*</span></label>
          <input
            v-model="newModelConfig.api_key"
            type="password"
            class="sm-input"
            placeholder="sk-..."
          />
        </div>
        <div :class="styles['form-group']">
          <label>模型名称 <span :class="styles.required">*</span></label>
          <input
            v-model="newModelConfig.model_name"
            type="text"
            class="sm-input"
            placeholder="gpt-4"
          />
        </div>
        <div class="form-actions">
          <button class="sm-button" @click="resetNewModelForm">取消</button>
          <button
            class="sm-button sm-button--secondary"
            :disabled="testingNewModel"
            @click="testNewModelConnection"
          >
            {{ testingNewModel ? '测试中...' : '测试连接' }}
          </button>
          <button class="sm-button sm-button--primary" @click="addNewModel">添加</button>
        </div>
      </div>

      <button
        v-if="!showNewModelForm"
        :class="['sm-button', styles['add-model-btn']]"
        @click="showNewModelForm = true"
      >
        添加模型配置
      </button>
    </section>

    <div :class="styles['save-actions']">
      <button
        class="sm-button sm-button--primary"
        :disabled="configStore.saving"
        @click="handleSave"
      >
        {{ configStore.saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </div>
</template>
