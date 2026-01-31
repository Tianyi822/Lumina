<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import ThemeSettings from './settings/ThemeSettings.vue'
import ModelSettings from './settings/ModelSettings.vue'
import MCPSettings from './settings/MCPSettings.vue'
import PromptSettings from './settings/PromptSettings.vue'
import EmbeddingModelSettings from './settings/EmbeddingModelSettings.vue'
import type { AppConfig, ThemeConfig, LLMConfigs, PromptConfig } from '@renderer/types'
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
const llmConfigs = reactive<LLMConfigs>({})
const defaultModel = ref('')

// 提示词配置
const promptConfig = reactive<PromptConfig>({
  enableEnhancedPrompt: true,
  toolDescriptionLevel: 'detailed',
  fewShotCount: 3
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
      if (config.llm_configs) {
        Object.keys(llmConfigs).forEach((key) => delete llmConfigs[key])
        Object.assign(llmConfigs, config.llm_configs)
      }
      defaultModel.value = config.default_model || ''
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

    const result = await window.api.config.updateConfig({
      theme: plainThemeConfig,
      llm_configs: plainLlmConfigs,
      default_model: defaultModel.value
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
  emit('close')
}

// 点击遮罩关闭
function handleOverlayClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="modal-overlay" @click="handleOverlayClick">
    <div class="modal-container">
      <!-- 模态框头部 -->
      <div class="modal-header">
        <h2 class="modal-title">设置</h2>
        <button class="btn close-btn" @click="handleClose">
          <span>×</span>
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'model' }"
          @click="activeTab = 'model'"
        >
          模型配置
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'mcp' }" @click="activeTab = 'mcp'">
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

      <!-- 内容区域 -->
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
          @update:error-message="errorMessage = $event"
          @update:success-message="successMessage = $event"
        />

        <!-- 提示词配置 Tab -->
        <PromptSettings
          v-else-if="activeTab === 'prompt'"
          :model-value="promptConfig"
          @update:model-value="(value) => Object.assign(promptConfig, value)"
        />

        <!-- 主题设置 Tab -->
        <ThemeSettings
          v-else-if="activeTab === 'theme'"
          :model-value="themeConfig"
          @update:model-value="(value) => Object.assign(themeConfig, value)"
        />
      </div>

      <!-- 消息提示 -->
      <div v-if="errorMessage" class="message error-message">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="message success-message">
        {{ successMessage }}
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
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  box-shadow: var(--theme-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  font-family: var(--theme-font);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--theme-text);
  background-color: var(--theme-bg-secondary);
}

.tab-btn.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
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
  color: var(--theme-text-secondary);
}

.message {
  padding: 10px 20px;
  font-size: 13px;
  flex-shrink: 0;
}

.error-message {
  background-color: rgba(248, 81, 73, 0.1);
  color: var(--theme-danger);
  border-top: 1px solid var(--theme-danger);
}

.success-message {
  background-color: rgba(63, 185, 80, 0.1);
  color: var(--theme-success);
  border-top: 1px solid var(--theme-success);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  flex-shrink: 0;
}
</style>
