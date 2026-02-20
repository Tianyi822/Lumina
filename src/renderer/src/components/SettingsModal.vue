<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import ThemeSettings from './settings/ThemeSettings.vue'
import ModelSettings from './settings/ModelSettings.vue'
import MCPSettings from './settings/MCPSettings.vue'
import PromptEngineeringSettings from './settings/PromptEngineeringSettings.vue'
import EmbeddingModelSettings from './settings/EmbeddingModelSettings.vue'
import type { AppConfig, ThemeConfig, LLMConfig, PromptConfig } from '@renderer/types'
import { deepClone } from '@shared/utils'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'config-updated'): void
  (e: 'mcp-updated'): void
}>()

// 当前激活的 Tab
const activeTab = ref<'theme' | 'model' | 'mcp' | 'prompt' | 'embedding'>('model')

// 加载状态
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const infoMessage = ref('')

// 主题配置
const themeConfig = reactive<ThemeConfig>({
  name: 'terminal',
  colors: {
    background: '#0d1117',
    backgroundSecondary: '#161b22',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    accent: '#3fb950',
    border: '#30363d'
  }
})

// 模型配置
const llmConfigs = reactive<LLMConfig[]>([])
const defaultModel = ref('')

// 提示词配置
const promptConfig = reactive<PromptConfig>({
  enableEnhancedPrompt: true,
  toolDescriptionLevel: 'detailed',
  fewShotCount: 3,
  enableDynamicExamples: false,
  enablePromptOptimization: false,
  optimizationAggressiveness: 'balanced'
})

// 加载配置
async function loadConfig(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const config = (await window.api.config.getConfig()) as AppConfig | null
    if (config) {
      // 加载主题配置
      if (config.theme) {
        themeConfig.name = config.theme.name || 'terminal'
        if (config.theme.colors) {
          Object.assign(themeConfig.colors!, config.theme.colors)
        }
      }
      // 加载模型配置
      if (config.llm_config?.models) {
        llmConfigs.length = 0
        llmConfigs.push(...config.llm_config.models)
      }
      defaultModel.value = config.llm_config?.default_model || ''
      // 加载提示词配置
      if (config.promptConfig) {
        Object.assign(promptConfig, config.promptConfig)
      }
    }
  } catch (error) {
    errorMessage.value = `加载配置失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    loading.value = false
  }
}

// 保存配置
async function saveConfig(): Promise<void> {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const plainThemeConfig = deepClone(themeConfig)
    const plainLlmConfigs = deepClone(llmConfigs)
    const plainPromptConfig = deepClone(promptConfig)

    const result = await window.api.config.updateConfig({
      theme: plainThemeConfig,
      llm_config: {
        default_model: defaultModel.value,
        compression_threshold: 0,
        enable_auto_compression: false,
        models: plainLlmConfigs
      },
      promptConfig: plainPromptConfig
    })
    if (result.success) {
      successMessage.value = '配置保存成功'
      emit('config-updated')
      setTimeout(() => {
        successMessage.value = ''
      }, 2000)
    } else {
      errorMessage.value = result.error || '保存失败'
    }
  } catch (error) {
    errorMessage.value = `保存配置失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    saving.value = false
  }
}

// 关闭弹窗
function handleClose(): void {
  infoMessage.value = ''
  emit('close')
}

// 提示词配置重置成功
function handlePromptResetSuccess(): void {
  successMessage.value = '提示词配置已重置为默认值'
  setTimeout(() => {
    successMessage.value = ''
  }, 2000)
}

// 主题变化处理（立即生效，无需保存）
function handleThemeChange(themeId: string): void {
  window.api.logger.info('[SettingsModal] 主题已切换', { themeId })
  successMessage.value = '主题已应用'
  setTimeout(() => {
    successMessage.value = ''
  }, 1500)
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  loadConfig()
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-container">
      <!-- 模态框头部 -->
      <div class="modal-header">
        <h2 class="modal-title">设置</h2>
        <button class="btn close-btn" @click="handleClose">
          <span>×</span>
        </button>
      </div>

      <!-- 主体区域：左右布局 -->
      <div class="modal-body">
        <!-- 左侧菜单 -->
        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'model' }"
            @click="activeTab = 'model'"
          >
            模型配置
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'mcp' }"
            @click="activeTab = 'mcp'"
          >
            MCP 服务
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'embedding' }"
            @click="activeTab = 'embedding'"
          >
            嵌入模型
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'prompt' }"
            @click="activeTab = 'prompt'"
          >
            提示词
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'theme' }"
            @click="activeTab = 'theme'"
          >
            主题设置
          </button>
        </div>

        <!-- 右侧内容区域 -->
        <div class="modal-content">
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <span>加载中...</span>
          </div>

          <!-- 模型配置 Tab -->
          <ModelSettings
            v-else-if="activeTab === 'model'"
            :model-configs="llmConfigs"
            :default-model="defaultModel"
            @update:model-configs="(value) => Object.assign(llmConfigs, value)"
            @update:default-model="(value) => (defaultModel = value)"
          />

          <!-- MCP 配置 Tab -->
          <MCPSettings
            v-else-if="activeTab === 'mcp'"
            :error-message="errorMessage"
            :success-message="successMessage"
            @update:error-message="errorMessage = $event"
            @update:success-message="successMessage = $event"
            @mcp-updated="emit('mcp-updated')"
          />

          <!-- 嵌入模型配置 Tab -->
          <EmbeddingModelSettings
            v-else-if="activeTab === 'embedding'"
            :error-message="errorMessage"
            :success-message="successMessage"
            :info-message="infoMessage"
            @update:error-message="errorMessage = $event"
            @update:success-message="successMessage = $event"
            @update:info-message="infoMessage = $event"
          />

          <!-- 提示词工程配置 Tab -->
          <PromptEngineeringSettings
            v-else-if="activeTab === 'prompt'"
            :model-value="promptConfig"
            @update:model-value="(value) => Object.assign(promptConfig, value)"
            @reset-success="handlePromptResetSuccess"
            @error="errorMessage = $event"
            @success="successMessage = $event"
          />

          <!-- 主题设置 Tab -->
          <ThemeSettings
            v-else-if="activeTab === 'theme'"
            :model-value="themeConfig"
            @update:model-value="(value) => Object.assign(themeConfig, value)"
            @theme-change="handleThemeChange"
          />
        </div>
      </div>

      <!-- 消息提示 -->
      <div v-if="errorMessage" class="message error-message">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="message success-message">
        {{ successMessage }}
      </div>
      <div v-if="infoMessage" class="message info-message">
        <span>{{ infoMessage }}</span>
        <button class="message-close" @click="infoMessage = ''">×</button>
      </div>

      <!-- 模态框底部 -->
      <div class="modal-footer">
        <button class="btn" @click="handleClose">取消</button>
        <button class="btn-primary" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px) saturate(120%);
  -webkit-backdrop-filter: blur(12px) saturate(120%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  overflow: hidden;
}

.modal-container {
  width: 100%;
  height: 100%;
  max-width: 900px;
  max-height: 700px;
  min-width: 400px;
  min-height: 300px;
  background:
    linear-gradient(135deg, var(--glass-white-027, rgba(255,255,255,0.027)) 0%, var(--glass-white-013, rgba(255,255,255,0.013)) 100%),
    linear-gradient(225deg, var(--glass-white-02, rgba(255,255,255,0.02)) 0%, var(--glass-white-007, rgba(255,255,255,0.007)) 100%),
    var(--theme-bg);
  backdrop-filter: blur(28px) saturate(200%) brightness(1.1);
  -webkit-backdrop-filter: blur(28px) saturate(200%) brightness(1.1);
  border: 1px solid var(--glass-white-1, rgba(255,255,255,0.1));
  border-radius: var(--theme-radius-lg);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.35),
    0 8px 24px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 var(--glass-white-15, rgba(255,255,255,0.15)),
    inset 0 -1px 0 var(--glass-white-05, rgba(255,255,255,0.05));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 960px) {
  .modal-container {
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 40px);
  }
}

@media (max-width: 768px) {
  .modal-overlay {
    padding: 10px;
  }

  .modal-container {
    max-width: 100%;
    max-height: 100%;
  }

  .tabs {
    width: 160px;
  }

  .tab-btn {
    padding: 10px 12px;
    font-size: 13px;
  }

  .modal-content {
    padding: 16px;
  }
}

@media (max-width: 600px) {
  .tabs {
    width: 140px;
  }

  .tab-btn {
    padding: 8px 10px;
    font-size: 12px;
  }

  .modal-header {
    padding: 12px 16px;
  }

  .modal-title {
    font-size: 16px;
  }

  .modal-footer {
    padding: 12px 16px;
  }

  .btn {
    padding: 6px 12px;
    font-size: 12px;
  }

  .modal-content {
    padding: 12px;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
  letter-spacing: -0.01em;
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  border-radius: 50%;
}

.modal-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

@media (max-width: 480px) {
  .modal-body {
    flex-direction: column;
  }

  .tabs {
    width: 100%;
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .tab-btn {
    white-space: nowrap;
    padding: 10px 16px;
    border-radius: 0;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 13px;
  }

  .tab-btn.active {
    border-radius: 0;
    border: none;
    border-bottom: 2px solid var(--theme-accent);
    background-color: transparent;
  }

  .modal-content {
    padding: 16px;
  }
}

.tabs {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
  padding: 8px;
  gap: 2px;
}

.tab-btn {
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--theme-text-secondary);
  font-family: var(--theme-font);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  text-align: left;
  border-radius: var(--theme-radius-sm);
}

.tab-btn:hover {
  color: var(--theme-text);
  background: var(--glass-white-05, rgba(255,255,255,0.05));
}

.tab-btn.active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--theme-accent);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--theme-text-tertiary);
}

.message {
  padding: 10px 20px;
  font-size: 13px;
  flex-shrink: 0;
}

.error-message {
  background: rgba(239, 68, 68, 0.08);
  color: var(--theme-danger);
  border-top: 1px solid rgba(239, 68, 68, 0.2);
}

.success-message {
  background: rgba(34, 197, 94, 0.08);
  color: var(--theme-success);
  border-top: 1px solid rgba(34, 197, 94, 0.2);
}

.info-message {
  background: rgba(245, 158, 11, 0.08);
  color: var(--theme-warning);
  border-top: 1px solid rgba(245, 158, 11, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.message-close {
  background: transparent;
  border: none;
  color: var(--theme-warning);
  font-size: 18px;
  padding: 0;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 10px;
  opacity: 0.7;
}

.message-close:hover {
  opacity: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
  background:
    linear-gradient(135deg, var(--glass-white-013, rgba(255,255,255,0.013)) 0%, var(--glass-white-007, rgba(255,255,255,0.007)) 100%);
  flex-shrink: 0;
}
</style>
