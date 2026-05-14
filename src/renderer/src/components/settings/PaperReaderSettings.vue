<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore, useUIStateStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { deepClone } from '@shared/utils'
import {
  OCR_PROVIDER_PRESETS,
  DEFAULT_OCR_PROVIDER,
  getOcrProviderPreset,
  type OcrProviderId,
  type PaperReaderConfig
} from '@shared/types/config'

const configStore = useConfigStore()
const uiStateStore = useUIStateStore()
const { paperReaderConfig, llmConfigs, defaultModel } = storeToRefs(configStore)

const notify = useNotification()

const localConfig = ref<PaperReaderConfig>({
  ocr: { provider: DEFAULT_OCR_PROVIDER }
})

const syncingLocalConfig = ref(false)
const testing = ref(false)

function showError(message: string): void {
  notify.error('论文阅读配置', message, { source: 'settings' })
}

function showSuccess(message: string): void {
  notify.success('论文阅读配置', message, { source: 'settings' })
}

async function loadLocalConfig(): Promise<void> {
  syncingLocalConfig.value = true
  localConfig.value = deepClone(paperReaderConfig.value)
  await nextTick()
  syncingLocalConfig.value = false
}

const currentPreset = computed(() => getOcrProviderPreset(localConfig.value.ocr.provider))

const ocrHasChanges = computed(() => {
  const current = localConfig.value
  const saved = paperReaderConfig.value
  return (
    current.ocr.provider !== saved.ocr.provider ||
    (current.ocr.apiKey ?? '') !== (saved.ocr.apiKey ?? '')
  )
})

const translationHasChanges = computed(() => {
  const current = localConfig.value
  const saved = paperReaderConfig.value
  return (current.translationModel ?? '') !== (saved.translationModel ?? '')
})

const canTest = computed(() => {
  return !!localConfig.value.ocr.apiKey?.trim() && !testing.value
})

const translationModelOptions = computed(() => {
  const defaultLabel = defaultModel.value ? `使用默认模型（${defaultModel.value}）` : '使用默认模型'
  const options = [{ label: defaultLabel, value: '' }]
  for (const model of llmConfigs.value) {
    options.push({
      label: model.model_name + (model.model_name === defaultModel.value ? ' (默认)' : ''),
      value: model.model_name
    })
  }
  return options
})

function buildPlainConfig(): PaperReaderConfig {
  const config: PaperReaderConfig = {
    ocr: {
      provider: localConfig.value.ocr.provider || DEFAULT_OCR_PROVIDER,
      apiKey: localConfig.value.ocr.apiKey?.trim() || undefined
    }
  }
  const model = localConfig.value.translationModel?.trim()
  if (model) {
    config.translationModel = model
  }
  return config
}

function handleProviderChange(providerId: OcrProviderId): void {
  localConfig.value.ocr.provider = providerId
}

async function handleTestConnection(): Promise<void> {
  if (!localConfig.value.ocr.apiKey?.trim()) {
    showError('请先填写 API Key')
    return
  }

  testing.value = true
  try {
    const result = await window.api.paper.testOcrConnection({
      provider: localConfig.value.ocr.provider,
      apiKey: localConfig.value.ocr.apiKey ?? ''
    })

    if (result.success) {
      showSuccess('连接测试成功，请点击保存配置以生效')
    } else {
      showError(result.error ?? '连接测试失败')
    }
  } catch (error) {
    showError(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    testing.value = false
  }
}

async function handleSaveOcr(): Promise<void> {
  const plainConfig = buildPlainConfig()
  configStore.updatePaperReaderConfig(plainConfig)
  const success = await configStore.saveConfig({ silent: true })
  if (!success) {
    showError('保存失败')
    return
  }
  uiStateStore.notifyConfigUpdate()
  showSuccess('OCR 配置已保存')
}

async function handleSaveTranslation(): Promise<void> {
  const plainConfig = buildPlainConfig()
  configStore.updatePaperReaderConfig(plainConfig)
  const success = await configStore.saveConfig({ silent: true })
  if (!success) {
    showError('保存失败')
    return
  }
  uiStateStore.notifyConfigUpdate()
  showSuccess('翻译模型配置已保存')
}

function handleOpenApiKeyUrl(): void {
  const url = currentPreset.value?.apiKeyUrl
  if (url) {
    window.api.window.openExternal(url)
  }
}

onMounted(() => {
  void loadLocalConfig()
})

onUnmounted(() => {
  // 清理逻辑已移除，通知中心自动管理定时器
})
</script>

<template>
  <div class="sm-settings-page paper-reader-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">论文阅读配置</h2>
      <p class="sm-settings-page__description">配置论文 OCR 识别服务与翻译模型。</p>
    </header>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">OCR 服务配置</h3>
          <p class="sm-settings-page__section-description">选择 OCR 服务提供商并配置对应的凭据。</p>
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label" for="paper-ocr-provider">OCR 服务</label>
        <select
          id="paper-ocr-provider"
          v-model="localConfig.ocr.provider"
          class="sm-input"
          @change="handleProviderChange(localConfig.ocr.provider)"
        >
          <option v-for="preset in OCR_PROVIDER_PRESETS" :key="preset.id" :value="preset.id">
            {{ preset.label }}
          </option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group field-card flex-1">
          <label class="form-label">模型名称</label>
          <div class="provider-display">{{ currentPreset?.modelName ?? '-' }}</div>
        </div>

        <div class="form-group field-card flex-1">
          <label class="form-label">
            并发数
            <span class="field-hint">由该模型官方限制，不允许更改</span>
          </label>
          <div class="provider-display">{{ currentPreset?.concurrency ?? '-' }}</div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group field-card flex-1">
          <label class="form-label">
            API Key
            <a
              v-if="currentPreset?.apiKeyUrl"
              class="api-key-link"
              href="#"
              @click.prevent="handleOpenApiKeyUrl"
            >
              获取 API KEY
            </a>
          </label>
          <input
            v-model="localConfig.ocr.apiKey"
            type="password"
            class="sm-input"
            placeholder="填写对应的 API Key"
            autocomplete="new-password"
          />
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label">请求地址</label>
        <div class="provider-display">{{ currentPreset?.url ?? '-' }}</div>
      </div>

      <div class="form-actions">
        <div class="form-actions__buttons">
          <button
            class="sm-button sm-button--secondary"
            :disabled="!canTest"
            @click="handleTestConnection"
          >
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <button
            class="sm-button sm-button--primary"
            :disabled="!ocrHasChanges"
            @click="handleSaveOcr"
          >
            保存配置
          </button>
        </div>
      </div>
    </section>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">翻译模型配置</h3>
          <p class="sm-settings-page__section-description">
            选择用于论文翻译的 LLM 模型。翻译需要上下文关联能力，只能从已配置的对话模型中选择。
          </p>
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label" for="paper-translation-model">翻译模型</label>
        <select
          id="paper-translation-model"
          v-model="localConfig.translationModel"
          class="sm-input"
        >
          <option
            v-for="option in translationModelOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="form-actions">
        <div class="form-actions__buttons">
          <button
            class="sm-button sm-button--primary"
            :disabled="!translationHasChanges"
            @click="handleSaveTranslation"
          >
            保存配置
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.paper-reader-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0;
}

.form-row {
  display: flex;
  gap: 16px;
}

.flex-1 {
  flex: 1;
}

.field-card {
  padding: 14px 16px;
  border-radius: var(--sm-radius-md);
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.field-card:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.field-card:focus-within {
  border-color: var(--sm-color-border-accent);
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--sm-color-text-secondary);
  white-space: nowrap;
}

.api-key-link {
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-color-text-accent);
  text-decoration: none;
  white-space: nowrap;
}

.api-key-link:hover {
  text-decoration: underline;
}

.provider-display {
  min-height: 36px;
  padding: 8px 12px;
  border-radius: var(--sm-radius-sm);
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  word-break: break-all;
}

select.sm-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
  margin-top: calc(var(--sm-space-2) / -4);
}

.form-actions__buttons {
  display: flex;
  gap: 12px;
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }

  .form-actions__buttons {
    width: 100%;
  }

  .form-actions__buttons .sm-button {
    flex: 1;
  }
}
</style>
