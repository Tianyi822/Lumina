<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const hasChanges = computed(() => {
  const current = localConfig.value
  const saved = videoGenerationConfig.value

  return (
    current.enabled !== saved.enabled ||
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

function loadLocalConfig(): void {
  localConfig.value = {
    ...createDefaultVideoGenerationConfig(),
    ...videoGenerationConfig.value
  }
}

function buildPlainConfig(): VideoGenerationConfig {
  return {
    enabled: localConfig.value.enabled,
    provider: 'zhipu',
    baseUrl: localConfig.value.baseUrl.trim(),
    apiKey: localConfig.value.apiKey?.trim() || '',
    model: localConfig.value.model.trim(),
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
  loadLocalConfig()
}

onMounted(() => {
  loadLocalConfig()
})
</script>

<template>
  <div class="video-settings">
    <div class="hint-banner">
      <span class="hint-text">
        首版使用智谱 AI 的 CogVideoX 视频接口，当前设置仅供聊天工具链在主进程内调用。
      </span>
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
        <label for="video-generation-enabled" class="toggle-label">
          {{ localConfig.enabled ? '已启用' : '未启用' }}
        </label>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Provider</label>
      <div class="provider-badge">智谱 AI</div>
    </div>

    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Base URL</label>
        <input
          v-model="localConfig.baseUrl"
          type="text"
          class="input"
          placeholder="https://open.bigmodel.cn"
        />
      </div>

      <div class="form-group">
        <label class="form-label">模型名</label>
        <input v-model="localConfig.model" type="text" class="input" placeholder="cogvideox-3" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">API Key</label>
      <input
        v-model="localConfig.apiKey"
        type="password"
        class="input"
        placeholder="填写智谱 API Key"
      />
    </div>

    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">默认分辨率</label>
        <select v-model="localConfig.defaultSize" class="input">
          <option v-for="option in sizeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">默认质量</label>
        <select v-model="localConfig.defaultQuality" class="input">
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
        <label for="video-with-audio" class="toggle-label">
          {{ localConfig.defaultWithAudio ? '开启音频' : '关闭音频' }}
        </label>
      </div>
    </div>

    <div class="setting-note">当前轮询间隔和超时时间使用内置默认值：5 秒轮询，10 分钟超时。</div>

    <div class="actions">
      <button class="btn btn-secondary" :disabled="!hasChanges" @click="handleReset">重置</button>
      <button class="btn" :disabled="!hasChanges" @click="handleSave">保存配置</button>
    </div>
  </div>
</template>

<style scoped>
.video-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hint-banner {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hint-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.setting-switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toggle-input {
  width: 18px;
  height: 18px;
}

.toggle-label {
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.provider-badge {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--theme-text);
  font-size: 14px;
}

.setting-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-text-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--theme-text);
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .setting-switch-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .actions {
    justify-content: stretch;
  }

  .actions .btn {
    flex: 1;
  }
}
</style>
