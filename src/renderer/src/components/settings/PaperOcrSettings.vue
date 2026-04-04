<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore, useUIStateStore } from '@renderer/stores'
import {
  OCR_PROVIDER_PRESETS,
  DEFAULT_OCR_PROVIDER,
  getOcrProviderPreset,
  type OcrProviderId,
  type PaperOcrConfig
} from '@shared/types/config'

interface Props {
  errorMessage: string
  successMessage: string
}

interface Emits {
  (e: 'update:errorMessage', value: string): void
  (e: 'update:successMessage', value: string): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const configStore = useConfigStore()
const uiStateStore = useUIStateStore()
const { paperOcrConfig } = storeToRefs(configStore)

const localConfig = ref<PaperOcrConfig>({ provider: DEFAULT_OCR_PROVIDER })

const syncingLocalConfig = ref(false)
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

function showError(message: string): void {
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 2000)
}

async function loadLocalConfig(): Promise<void> {
  syncingLocalConfig.value = true
  localConfig.value = {
    ...paperOcrConfig.value
  }
  await nextTick()
  syncingLocalConfig.value = false
}

const currentPreset = computed(() => getOcrProviderPreset(localConfig.value.provider))

const hasChanges = computed(() => {
  const current = localConfig.value
  const saved = paperOcrConfig.value

  return current.provider !== saved.provider || (current.apiKey ?? '') !== (saved.apiKey ?? '')
})

const canTest = computed(() => {
  return !!localConfig.value.apiKey?.trim() && !testing.value
})

function buildPlainConfig(): PaperOcrConfig {
  return {
    provider: localConfig.value.provider || DEFAULT_OCR_PROVIDER,
    apiKey: localConfig.value.apiKey?.trim() || undefined
  }
}

function handleProviderChange(providerId: OcrProviderId): void {
  localConfig.value.provider = providerId
  testResult.value = null
}

async function handleTestConnection(): Promise<void> {
  testing.value = true
  testResult.value = null

  const result = await window.api.paper.testOcrConnection({
    provider: localConfig.value.provider,
    apiKey: localConfig.value.apiKey ?? ''
  })

  testing.value = false

  if (result.success) {
    testResult.value = { success: true, message: '连接成功' }
  } else {
    testResult.value = { success: false, message: result.error ?? '连接失败' }
  }
}

async function handleSave(): Promise<void> {
  const plainConfig = buildPlainConfig()

  configStore.updatePaperOcrConfig(plainConfig)
  const success = await configStore.saveConfig({ silent: true })

  if (!success) {
    showError(configStore.errorMessage || '保存失败')
    return
  }

  uiStateStore.notifyConfigUpdate()
  showSuccess('OCR 模型配置已保存')
}

function handleReset(): void {
  void loadLocalConfig()
  testResult.value = null
}

onMounted(() => {
  void loadLocalConfig()
})
</script>

<template>
  <div class="sm-settings-page paper-ocr-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">OCR 模型配置</h2>
      <p class="sm-settings-page__description">配置论文 OCR 识别服务凭据与模型。</p>
    </header>

    <div class="sm-settings-banner">OCR 将在论文页面上传后自动执行。</div>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">服务配置</h3>
          <p class="sm-settings-page__section-description">选择 OCR 服务提供商并配置对应的凭据。</p>
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label" for="paper-ocr-provider">OCR 服务</label>
        <select
          id="paper-ocr-provider"
          v-model="localConfig.provider"
          class="sm-input"
          @change="handleProviderChange(localConfig.provider)"
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
          <label class="form-label">API Key</label>
          <input
            v-model="localConfig.apiKey"
            type="password"
            class="sm-input"
            placeholder="填写对应的 API Key"
            autocomplete="new-password"
            @input="testResult = null"
          />
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label">请求地址</label>
        <div class="provider-display">{{ currentPreset?.url ?? '-' }}</div>
      </div>
    </section>

    <section class="sm-settings-page__section sm-settings-page__section--compact">
      <div class="form-actions">
        <div
          v-if="testResult"
          class="test-result"
          :class="testResult.success ? 'test-success' : 'test-failed'"
        >
          {{ testResult.message }}
        </div>

        <div class="form-actions__buttons">
          <button
            class="sm-button sm-button--secondary"
            :disabled="!canTest"
            @click="handleTestConnection"
          >
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <button
            class="sm-button sm-button--secondary"
            :disabled="!hasChanges"
            @click="handleReset"
          >
            重置
          </button>
          <button class="sm-button sm-button--primary" :disabled="!hasChanges" @click="handleSave">
            保存配置
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.paper-ocr-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
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
}

.form-actions__buttons {
  display: flex;
  gap: 12px;
}

.test-result {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: var(--sm-radius-sm);
}

.test-success {
  color: var(--sm-color-text-success, #22c55e);
  background: var(--sm-color-surface-1);
}

.test-failed {
  color: var(--sm-color-text-error, #ef4444);
  background: var(--sm-color-surface-1);
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
