<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@renderer/stores'
import type { VoiceRecognitionConfig } from '@shared/types/config'

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
const { voiceRecognitionConfig } = storeToRefs(configStore)

// 本地表单数据
const localConfig = ref<VoiceRecognitionConfig>({
  provider: 'aliyun',
  enabled: false,
  accessKeyId: '',
  accessKeySecret: '',
  token: '',
  appkey: ''
})

// 测试连接状态
const testing = ref(false)
const fetchingToken = ref(false)

// 是否有未保存的更改
const hasChanges = computed(() => {
  return (
    localConfig.value.enabled !== voiceRecognitionConfig.value.enabled ||
    localConfig.value.accessKeyId !== voiceRecognitionConfig.value.accessKeyId ||
    localConfig.value.accessKeySecret !== voiceRecognitionConfig.value.accessKeySecret ||
    localConfig.value.token !== voiceRecognitionConfig.value.token ||
    localConfig.value.appkey !== voiceRecognitionConfig.value.appkey
  )
})

// 显示消息
function showError(message: string): void {
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(() => {
    emit('update:successMessage', '')
  }, 2000)
}

// 从 Store 加载配置到本地
function loadLocalConfig(): void {
  localConfig.value = {
    provider: voiceRecognitionConfig.value.provider || 'aliyun',
    enabled: voiceRecognitionConfig.value.enabled || false,
    accessKeyId: voiceRecognitionConfig.value.accessKeyId || '',
    accessKeySecret: voiceRecognitionConfig.value.accessKeySecret || '',
    token: voiceRecognitionConfig.value.token || '',
    appkey: voiceRecognitionConfig.value.appkey || ''
  }
}

// 保存配置
async function handleSave(): Promise<void> {
  configStore.updateVoiceRecognitionConfig(localConfig.value)
  const success = await configStore.saveConfig()
  if (success) {
    showSuccess('语音识别配置已保存')
  } else {
    showError(configStore.errorMessage || '保存失败')
  }
}

// 重置为已保存的配置
function handleReset(): void {
  loadLocalConfig()
}

// 测试连接
async function handleTest(): Promise<void> {
  if (!localConfig.value.token) {
    showError('请先填写 Token')
    return
  }
  if (!localConfig.value.appkey) {
    showError('请先填写 Appkey')
    return
  }

  testing.value = true
  try {
    const result = await window.api.voiceRecognition.test(localConfig.value)
    if (result.success) {
      showSuccess('连接测试成功')
    } else {
      showError(result.error || '连接测试失败')
    }
  } catch (error) {
    showError(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    testing.value = false
  }
}

// 获取 Token
async function handleFetchToken(): Promise<void> {
  if (!localConfig.value.accessKeyId) {
    showError('请先填写 AccessKey ID')
    return
  }
  if (!localConfig.value.accessKeySecret) {
    showError('请先填写 AccessKey Secret')
    return
  }

  fetchingToken.value = true
  try {
    const result = await window.api.voiceRecognition.fetchToken(
      localConfig.value.accessKeyId,
      localConfig.value.accessKeySecret
    )
    if (result.success && result.token) {
      localConfig.value.token = result.token
      showSuccess('Token 获取成功')
    } else {
      showError(result.error || 'Token 获取失败')
    }
  } catch (error) {
    showError(`获取 Token 失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    fetchingToken.value = false
  }
}

onMounted(() => {
  loadLocalConfig()
})
</script>

<template>
  <div class="voice-settings">
    <!-- 提示信息 -->
    <div class="hint-banner">
      <span class="hint-icon">ℹ️</span>
      <span class="hint-text">当前仅支持阿里云语音识别配置，后续可扩展其他服务商</span>
    </div>

    <!-- 启用开关 -->
    <div class="form-group">
      <label class="form-label">启用语音识别</label>
      <div class="toggle-wrapper">
        <input
          v-model="localConfig.enabled"
          type="checkbox"
          class="toggle-input"
          id="voice-enabled"
        />
        <label for="voice-enabled" class="toggle-label"></label>
      </div>
    </div>

    <!-- AccessKey ID -->
    <div class="form-group">
      <label class="form-label" for="access-key-id">AccessKey ID</label>
      <input
        id="access-key-id"
        v-model="localConfig.accessKeyId"
        type="text"
        class="form-input"
        placeholder="请输入阿里云 AccessKey ID"
      />
    </div>

    <!-- AccessKey Secret -->
    <div class="form-group">
      <label class="form-label" for="access-key-secret">AccessKey Secret</label>
      <input
        id="access-key-secret"
        v-model="localConfig.accessKeySecret"
        type="password"
        class="form-input"
        placeholder="请输入阿里云 AccessKey Secret"
        autocomplete="new-password"
      />
      <span class="form-hint">用于自动获取 Token，可选配置</span>
    </div>

    <!-- 获取 Token 按钮 -->
    <div class="form-group">
      <button
        class="btn btn-secondary"
        :disabled="fetchingToken || !localConfig.accessKeyId || !localConfig.accessKeySecret"
        @click="handleFetchToken"
      >
        {{ fetchingToken ? '获取中...' : '自动获取 Token' }}
      </button>
    </div>

    <!-- Token -->
    <div class="form-group">
      <label class="form-label" for="token">服务鉴权 Token</label>
      <input
        id="token"
        v-model="localConfig.token"
        type="text"
        class="form-input"
        placeholder="请输入语音识别服务 Token"
      />
      <span class="form-hint">
        可通过 AccessKey 自动获取，或从
        <a href="https://nls-portal.console.aliyun.com/" target="_blank">阿里云控制台</a>
        获取
      </span>
    </div>

    <!-- Appkey -->
    <div class="form-group">
      <label class="form-label" for="appkey">项目 Appkey</label>
      <input
        id="appkey"
        v-model="localConfig.appkey"
        type="text"
        class="form-input"
        placeholder="请输入语音识别项目 Appkey"
      />
      <span class="form-hint">
        从
        <a href="https://nls-portal.console.aliyun.com/applist" target="_blank">智能语音控制台</a>
        获取
      </span>
    </div>

    <!-- 操作按钮 -->
    <div class="form-actions">
      <button
        class="btn btn-secondary"
        :disabled="!hasChanges"
        @click="handleReset"
      >
        重置
      </button>
      <button
        class="btn btn-secondary"
        :disabled="testing || !localConfig.token || !localConfig.appkey"
        @click="handleTest"
      >
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <button
        class="btn btn-primary"
        :disabled="!hasChanges"
        @click="handleSave"
      >
        保存配置
      </button>
    </div>
  </div>
</template>

<style scoped>
.voice-settings {
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

.hint-icon {
  font-size: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.form-input {
  padding: 10px 12px;
  background: var(--glass-white-05, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text);
  font-size: 13px;
  font-family: var(--theme-font);
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--theme-accent);
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.form-input::placeholder {
  color: var(--theme-text-tertiary);
}

.form-hint {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.form-hint a {
  color: var(--theme-accent);
  text-decoration: none;
}

.form-hint a:hover {
  text-decoration: underline;
}

/* Toggle Switch */
.toggle-wrapper {
  display: flex;
  align-items: center;
}

.toggle-input {
  display: none;
}

.toggle-label {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  background: var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-label::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: var(--theme-text);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.toggle-input:checked + .toggle-label {
  background: var(--theme-accent);
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
</style>
