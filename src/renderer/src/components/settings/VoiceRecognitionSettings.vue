<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
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

// 是否正在保存 enabled 状态（用于防止重复触发）
const savingEnabled = ref(false)
// 是否正在从已保存配置同步到本地表单
const syncingLocalConfig = ref(false)

function validateVoiceConfig(config: VoiceRecognitionConfig): string {
  const hasAccessKeyId = Boolean(config.accessKeyId?.trim())
  const hasAccessKeySecret = Boolean(config.accessKeySecret?.trim())
  const hasToken = Boolean(config.token?.trim())
  const hasAppkey = Boolean(config.appkey?.trim())

  if (hasAccessKeyId !== hasAccessKeySecret) {
    return hasAccessKeyId
      ? '如需使用 AccessKey 自动获取 Token，请同时填写 AccessKey Secret'
      : '如需使用 AccessKey 自动获取 Token，请同时填写 AccessKey ID'
  }

  if (config.enabled) {
    if (!hasToken) {
      return '启用语音识别前请先填写 Token'
    }
    if (!hasAppkey) {
      return '启用语音识别前请先填写 Appkey'
    }
  }

  return ''
}

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
      const nextConfig: VoiceRecognitionConfig = {
        ...voiceRecognitionConfig.value,
        enabled: newValue,
        accessKeyId: localConfig.value.accessKeyId?.trim(),
        accessKeySecret: localConfig.value.accessKeySecret?.trim(),
        token: localConfig.value.token?.trim(),
        appkey: localConfig.value.appkey?.trim()
      }
      const validationMessage = validateVoiceConfig(nextConfig)
      if (validationMessage) {
        localConfig.value.enabled = oldValue
        showError(validationMessage)
        return
      }

      // 立即更新 configStore
      configStore.updateVoiceRecognitionConfig(nextConfig)
      // 保存到配置文件
      const success = await configStore.saveConfig()
      if (success) {
        window.api.logger.info('[VoiceRecognitionSettings] 语音识别开关已更新', {
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

// 测试连接状态
const testing = ref(false)
const fetchingToken = ref(false)

// 是否有未保存的更改（enabled 是即时保存的，不计算在内）
const hasChanges = computed(() => {
  return (
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

// 从 Store 加载配置到本地，避免触发开关自动保存
async function loadLocalConfig(): Promise<void> {
  syncingLocalConfig.value = true
  localConfig.value = {
    provider: voiceRecognitionConfig.value.provider || 'aliyun',
    enabled: voiceRecognitionConfig.value.enabled || false,
    accessKeyId: voiceRecognitionConfig.value.accessKeyId || '',
    accessKeySecret: voiceRecognitionConfig.value.accessKeySecret || '',
    token: voiceRecognitionConfig.value.token || '',
    appkey: voiceRecognitionConfig.value.appkey || ''
  }
  await nextTick()
  syncingLocalConfig.value = false
}

// 构造普通对象，避免将 Vue 响应式代理直接传给跨进程 API
function buildPlainConfig(): VoiceRecognitionConfig {
  return {
    provider: localConfig.value.provider,
    enabled: localConfig.value.enabled,
    accessKeyId: localConfig.value.accessKeyId?.trim(),
    accessKeySecret: localConfig.value.accessKeySecret?.trim(),
    token: localConfig.value.token?.trim(),
    appkey: localConfig.value.appkey?.trim()
  }
}

// 保存配置
async function handleSave(): Promise<void> {
  const plainConfig = buildPlainConfig()
  const validationMessage = validateVoiceConfig(plainConfig)
  if (validationMessage) {
    showError(validationMessage)
    return
  }

  configStore.updateVoiceRecognitionConfig(plainConfig)
  const success = await configStore.saveConfig()
  if (success) {
    showSuccess('语音识别配置已保存')
  } else {
    showError(configStore.errorMessage || '保存失败')
  }
}

// 重置为已保存的配置
function handleReset(): void {
  void loadLocalConfig()
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
    const result = await window.api.voiceRecognition.test(buildPlainConfig())
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
  void loadLocalConfig()
})
</script>

<template>
  <div class="voice-settings">
    <!-- 提示信息 -->
    <div class="hint-banner">
      <span class="hint-text">当前仅支持阿里云语音识别配置，后续可扩展其他服务商</span>
    </div>

    <!-- 启用开关 -->
    <div class="form-group setting-switch-card">
      <label class="form-label">启用语音识别</label>
      <div class="toggle-wrapper">
        <input
          id="voice-enabled"
          v-model="localConfig.enabled"
          type="checkbox"
          class="toggle-input"
        />
        <label for="voice-enabled" class="toggle-label"></label>
      </div>
    </div>

    <!-- AccessKey ID -->
    <div class="form-group field-card">
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
    <div class="form-group field-card">
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
    <div class="form-group action-group">
      <button
        class="btn btn-secondary fetch-token-btn"
        :disabled="fetchingToken || !localConfig.accessKeyId || !localConfig.accessKeySecret"
        @click="handleFetchToken"
      >
        {{ fetchingToken ? '获取中...' : '自动获取 Token' }}
      </button>
    </div>

    <!-- Token -->
    <div class="form-group field-card">
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
    <div class="form-group field-card">
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
      <button class="btn btn-secondary" :disabled="!hasChanges" @click="handleReset">重置</button>
      <button
        class="btn btn-secondary"
        :disabled="testing || !localConfig.token || !localConfig.appkey"
        @click="handleTest"
      >
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <button class="btn btn-primary" :disabled="!hasChanges" @click="handleSave">保存配置</button>
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

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0;
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

.form-hint {
  font-size: 12px;
  color: var(--theme-text-tertiary);
  line-height: 1.5;
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

.action-group {
  margin-top: -4px;
}

.fetch-token-btn {
  width: 100%;
  min-height: 44px;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 42%, white 58%);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-accent) 14%, white 86%) 0%,
    color-mix(in srgb, var(--theme-accent) 8%, white 92%) 100%
  );
  color: color-mix(in srgb, var(--theme-accent) 72%, black 28%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 8px 18px rgba(15, 23, 42, 0.06);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.fetch-token-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme-accent) 65%, white 35%);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--theme-accent) 20%, white 80%) 0%,
    color-mix(in srgb, var(--theme-accent) 12%, white 88%) 100%
  );
  color: color-mix(in srgb, var(--theme-accent) 82%, black 18%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    0 12px 24px rgba(15, 23, 42, 0.08),
    0 0 0 3px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

.fetch-token-btn:active:not(:disabled) {
  transform: translateY(0);
}

.fetch-token-btn:disabled {
  border-color: rgba(148, 163, 184, 0.32);
  background: linear-gradient(135deg, rgba(241, 245, 249, 0.88) 0%, rgba(248, 250, 252, 0.82) 100%);
  color: rgba(100, 116, 139, 0.72);
  box-shadow: none;
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
