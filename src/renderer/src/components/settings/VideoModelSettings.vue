<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore, useUIStateStore } from '@renderer/stores'
import {
  createDefaultVideoGenerationConfig,
  type VideoGenerationConfig,
  type VideoQuality,
  type VideoSize
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
const { videoGenerationConfig } = storeToRefs(configStore)

const localConfig = ref<VideoGenerationConfig>(createDefaultVideoGenerationConfig())

const sizeOptions: Array<{ value: VideoSize; label: string }> = [
  { value: '1920x1080', label: '横版 1920x1080' },
  { value: '1080x1920', label: '竖版 1080x1920' },
  { value: '1280x720', label: '标准 1280x720' }
]

const qualityOptions: Array<{ value: VideoQuality; label: string }> = [
  { value: 'quality', label: '高质量' },
  { value: 'speed', label: '快速' }
]

// 是否正在保存 enabled 状态（用于防止重复触发）
const savingEnabled = ref(false)
// 是否正在从已保存配置同步到本地表单
const syncingLocalConfig = ref(false)

// 监听 enabled 开关变更，立即保存并更新 UI
watch(
  () => localConfig.value.enabled,
  async (newValue, oldValue) => {
    // 防止初始化时触发
    if (oldValue === undefined || savingEnabled.value || syncingLocalConfig.value) return
    // 只有当值真正改变时才保存
    if (newValue === oldValue) return

    savingEnabled.value = true
    try {
      const nextConfig: VideoGenerationConfig = {
        ...videoGenerationConfig.value,
        enabled: newValue,
        baseUrl: localConfig.value.baseUrl?.trim(),
        apiKey: localConfig.value.apiKey?.trim(),
        model: localConfig.value.model?.trim()
      }
      const validationMessage = validateConfig(nextConfig)
      if (validationMessage) {
        localConfig.value.enabled = oldValue
        showError(validationMessage)
        return
      }

      // 立即更新 configStore
      configStore.updateVideoGenerationConfig(nextConfig)
      // 保存到配置文件
      const success = await configStore.saveConfig()
      if (success) {
        window.api.logger.info('[VideoModelSettings] 视频生成开关已更新', {
          enabled: newValue
        })
      } else {
        // 保存失败，回滚本地状态
        localConfig.value.enabled = oldValue
        emit('update:errorMessage', '保存配置失败：' + (configStore.errorMessage || '未知错误'))
      }
    } finally {
      savingEnabled.value = false
    }
  }
)

// 是否有未保存的更改（enabled 是即时保存的，不计算在内）
const hasChanges = computed(() => {
  const current = localConfig.value
  const saved = videoGenerationConfig.value

  return (
    current.baseUrl !== saved.baseUrl ||
    current.apiKey !== saved.apiKey ||
    current.model !== saved.model ||
    current.defaultSize !== saved.defaultSize ||
    current.defaultQuality !== saved.defaultQuality ||
    current.defaultWithAudio !== saved.defaultWithAudio
  )
})

function showError(message: string): void {
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 2000)
}

// 从 Store 加载配置到本地，避免触发开关自动保存
async function loadLocalConfig(): Promise<void> {
  syncingLocalConfig.value = true
  localConfig.value = {
    ...createDefaultVideoGenerationConfig(),
    ...videoGenerationConfig.value
  }
  await nextTick()
  syncingLocalConfig.value = false
}

function buildPlainConfig(): VideoGenerationConfig {
  return {
    enabled: localConfig.value.enabled,
    provider: 'zhipu',
    baseUrl: localConfig.value.baseUrl?.trim(),
    apiKey: localConfig.value.apiKey?.trim() || '',
    model: localConfig.value.model?.trim(),
    defaultSize: localConfig.value.defaultSize,
    defaultQuality: localConfig.value.defaultQuality,
    defaultWithAudio: localConfig.value.defaultWithAudio,
    pollIntervalMs: localConfig.value.pollIntervalMs,
    requestTimeoutMs: localConfig.value.requestTimeoutMs
  }
}

function validateConfig(config: VideoGenerationConfig): string {
  if (config.baseUrl) {
    try {
      new URL(config.baseUrl)
    } catch {
      return 'Base URL 格式不正确'
    }
  }

  if (config.enabled) {
    if (!config.baseUrl) {
      return '启用视频生成前请先填写 Base URL'
    }
    if (!config.apiKey) {
      return '启用视频生成前请先填写 API Key'
    }
    if (!config.model) {
      return '启用视频生成前请先填写模型名'
    }
  }

  return ''
}

async function handleSave(): Promise<void> {
  const plainConfig = buildPlainConfig()
  const validationMessage = validateConfig(plainConfig)

  if (validationMessage) {
    showError(validationMessage)
    return
  }

  configStore.updateVideoGenerationConfig(plainConfig)
  const success = await configStore.saveConfig({ silent: true })

  if (!success) {
    showError(configStore.errorMessage || '保存失败')
    return
  }

  uiStateStore.notifyConfigUpdate()
  showSuccess('视频模型配置已保存')
}

function handleReset(): void {
  void loadLocalConfig()
}

onMounted(() => {
  void loadLocalConfig()
})
</script>

<template>
  <div class="sm-settings-page video-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">视频模型配置</h2>
      <p class="sm-settings-page__description">
        统一维护视频生成接口、默认输出规格和音频偏好，用于聊天工具链调用。
      </p>
    </header>

    <div class="sm-settings-banner">
      首版使用智谱 AI 的 CogVideoX 视频接口，当前设置仅供聊天工具链在主进程内调用。
    </div>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">服务凭据</h3>
          <p class="sm-settings-page__section-description">
            启用状态即时保存，其余字段按需统一提交。
          </p>
        </div>
      </div>

      <div class="form-group setting-switch-card">
        <label class="form-label">启用视频生成</label>
        <div class="toggle-wrapper">
          <input
            id="video-generation-enabled"
            v-model="localConfig.enabled"
            type="checkbox"
            class="toggle-input"
          />
          <label for="video-generation-enabled" class="toggle-label"></label>
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label">Provider</label>
        <div class="provider-display">智谱 AI</div>
      </div>

      <div class="form-row">
        <div class="form-group field-card flex-1">
          <label class="form-label" for="video-base-url">Base URL</label>
          <input
            id="video-base-url"
            v-model="localConfig.baseUrl"
            type="text"
            class="sm-input"
            placeholder="https://open.bigmodel.cn"
          />
        </div>

        <div class="form-group field-card flex-1">
          <label class="form-label" for="video-model">模型名</label>
          <input
            id="video-model"
            v-model="localConfig.model"
            type="text"
            class="sm-input"
            placeholder="cogvideox-3"
          />
        </div>
      </div>

      <div class="form-group field-card">
        <label class="form-label" for="video-api-key">API Key</label>
        <input
          id="video-api-key"
          v-model="localConfig.apiKey"
          type="password"
          class="sm-input"
          placeholder="填写智谱 API Key"
          autocomplete="new-password"
        />
      </div>
    </section>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">默认输出</h3>
          <p class="sm-settings-page__section-description">控制默认分辨率、质量和音频输出。</p>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group field-card flex-1">
          <label class="form-label" for="video-size">默认分辨率</label>
          <select id="video-size" v-model="localConfig.defaultSize" class="sm-select">
            <option v-for="option in sizeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="form-group field-card flex-1">
          <label class="form-label" for="video-quality">默认质量</label>
          <select id="video-quality" v-model="localConfig.defaultQuality" class="sm-select">
            <option v-for="option in qualityOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="form-group setting-switch-card">
        <label class="form-label">默认生成音频</label>
        <div class="toggle-wrapper">
          <input
            id="video-with-audio"
            v-model="localConfig.defaultWithAudio"
            type="checkbox"
            class="toggle-input"
          />
          <label for="video-with-audio" class="toggle-label"></label>
        </div>
      </div>

      <div class="form-actions">
        <button class="sm-button sm-button--secondary" :disabled="!hasChanges" @click="handleReset">
          重置
        </button>
        <button class="sm-button sm-button--primary" :disabled="!hasChanges" @click="handleSave">
          保存配置
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.video-settings {
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

.setting-switch-card,
.field-card {
  padding: 14px 16px;
  border-radius: var(--sm-radius-md);
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.field-card:hover,
.setting-switch-card:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.field-card:focus-within,
.setting-switch-card:focus-within {
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
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-input {
  display: none;
}

.toggle-label {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  background: var(--sm-color-border-default);
  border: 1px solid transparent;
  border-radius: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-label::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  transform: translateY(-50%);
  transition: left 0.2s ease;
}

.toggle-input:checked + .toggle-label {
  background: var(--sm-color-accent);
  border-color: var(--sm-color-border-accent);
}

.toggle-input:checked + .toggle-label::after {
  left: 25px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: calc(var(--sm-space-2) / -4);
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }

  .setting-switch-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-actions {
    justify-content: stretch;
  }

  .form-actions .sm-button {
    flex: 1;
  }
}
</style>
