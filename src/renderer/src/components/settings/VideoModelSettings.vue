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
  <div class="video-settings">
    <!-- 提示信息 -->
    <div class="hint-banner">
      <span class="hint-text">
        首版使用智谱 AI 的 CogVideoX 视频接口，当前设置仅供聊天工具链在主进程内调用。
      </span>
    </div>

    <!-- 启用开关 -->
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

    <!-- Provider -->
    <div class="form-group field-card">
      <label class="form-label">Provider</label>
      <div class="provider-display">智谱 AI</div>
    </div>

    <!-- Base URL 和 模型名 -->
    <div class="form-row">
      <div class="form-group field-card flex-1">
        <label class="form-label" for="video-base-url">Base URL</label>
        <input
          id="video-base-url"
          v-model="localConfig.baseUrl"
          type="text"
          class="form-input"
          placeholder="https://open.bigmodel.cn"
        />
      </div>

      <div class="form-group field-card flex-1">
        <label class="form-label" for="video-model">模型名</label>
        <input
          id="video-model"
          v-model="localConfig.model"
          type="text"
          class="form-input"
          placeholder="cogvideox-3"
        />
      </div>
    </div>

    <!-- API Key -->
    <div class="form-group field-card">
      <label class="form-label" for="video-api-key">API Key</label>
      <input
        id="video-api-key"
        v-model="localConfig.apiKey"
        type="password"
        class="form-input"
        placeholder="填写智谱 API Key"
        autocomplete="new-password"
      />
    </div>

    <!-- 默认分辨率和默认质量 -->
    <div class="form-row">
      <div class="form-group field-card flex-1">
        <label class="form-label" for="video-size">默认分辨率</label>
        <select id="video-size" v-model="localConfig.defaultSize" class="form-input">
          <option v-for="option in sizeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="form-group field-card flex-1">
        <label class="form-label" for="video-quality">默认质量</label>
        <select id="video-quality" v-model="localConfig.defaultQuality" class="form-input">
          <option v-for="option in qualityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- 默认生成音频开关 -->
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

    <!-- 操作按钮 -->
    <div class="form-actions">
      <button class="btn btn-secondary" :disabled="!hasChanges" @click="handleReset">重置</button>
      <button class="btn btn-primary" :disabled="!hasChanges" @click="handleSave">保存配置</button>
    </div>
  </div>
</template>

<style scoped>
.video-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hint-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  font-size: 13px;
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
  border-radius: calc(var(--theme-radius-sm) + 2px);
  border: 1px solid rgba(120, 134, 156, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%),
    rgba(16, 24, 40, 0.04);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 24px rgba(15, 23, 42, 0.05);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.field-card:hover,
.setting-switch-card:hover {
  border-color: rgba(120, 134, 156, 0.28);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.045) 100%),
    rgba(16, 24, 40, 0.05);
}

.field-card:focus-within,
.setting-switch-card:focus-within {
  border-color: color-mix(in srgb, var(--theme-accent) 58%, white 42%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 3px rgba(99, 102, 241, 0.12),
    0 16px 30px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  letter-spacing: 0.01em;
}

.form-input {
  min-height: 42px;
  padding: 11px 13px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(248, 250, 252, 0.88) 100%),
    rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: var(--theme-radius-sm);
  color: #0f172a;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--theme-font);
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.06),
    0 1px 0 rgba(255, 255, 255, 0.45);
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.form-input:hover {
  border-color: rgba(100, 116, 139, 0.56);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.92) 100%),
    rgba(255, 255, 255, 0.92);
}

.form-input:focus {
  outline: none;
  border-color: var(--theme-accent);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(248, 250, 252, 0.96) 100%),
    rgba(255, 255, 255, 0.96);
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.05),
    0 0 0 3px rgba(99, 102, 241, 0.16);
  transform: translateY(-1px);
}

.form-input::placeholder {
  color: rgba(71, 85, 105, 0.72);
}

.provider-display {
  min-height: 42px;
  padding: 11px 13px;
  border-radius: var(--theme-radius-sm);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(248, 250, 252, 0.04) 100%),
    rgba(16, 24, 40, 0.03);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
}

/* Toggle Switch */
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
  background: rgba(100, 116, 139, 0.22);
  border: 1px solid rgba(100, 116, 139, 0.26);
  box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.14);
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
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
  border-radius: 50%;
  transform: translateY(-50%);
  transition: left 0.2s ease;
}

.toggle-input:checked + .toggle-label {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.toggle-input:checked + .toggle-label::after {
  left: 25px;
}

/* Buttons */
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--theme-font);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border: 1px solid var(--glass-white-15, rgba(255, 255, 255, 0.15));
  color: var(--theme-text-secondary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  color: var(--theme-text);
}

.btn-primary {
  background: var(--theme-accent);
  border: 1px solid var(--theme-accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
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

  .form-actions .btn {
    flex: 1;
  }
}
</style>
