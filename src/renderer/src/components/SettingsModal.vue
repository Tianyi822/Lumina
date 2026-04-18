<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import ThemeSettings from './settings/ThemeSettings.vue'
import ModelSettings from './settings/ModelSettings.vue'
import MCPSettings from './settings/MCPSettings.vue'
import PromptEngineeringSettings from './settings/PromptEngineeringSettings.vue'
import EmbeddingModelSettings from './settings/EmbeddingModelSettings.vue'
import KnowledgeMCPSettings from './settings/KnowledgeMCPSettings.vue'
import PaperReaderSettings from './settings/PaperReaderSettings.vue'
import { useConfigStore } from '@renderer/stores'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'mcp-updated'): void
}>()

type SettingsTabKey =
  | 'theme'
  | 'model'
  | 'mcp'
  | 'prompt'
  | 'embedding'
  | 'knowledge'
  | 'paperReader'

// 使用 configStore
const configStore = useConfigStore()
const { loading, errorMessage, successMessage, themeConfig } = storeToRefs(configStore)

// 当前激活的 Tab
const activeTab = ref<SettingsTabKey>('model')

const settingsTabs: Array<{
  id: SettingsTabKey
  label: string
  description: string
}> = [
  {
    id: 'model',
    label: '对话模型配置',
    description: '管理默认模型、接口地址与上下文参数。'
  },
  {
    id: 'embedding',
    label: '嵌入模型配置',
    description: '维护知识检索所需的向量模型清单。'
  },
  {
    id: 'paperReader',
    label: '论文阅读配置',
    description: '配置论文 OCR 识别服务与翻译模型。'
  },
  {
    id: 'mcp',
    label: 'MCP 服务',
    description: '连接外部工具链并管理服务传输方式。'
  },
  {
    id: 'prompt',
    label: '提示词工程',
    description: '调整系统提示词、变量、示例与测试沙箱。'
  },
  {
    id: 'knowledge',
    label: '知识库服务',
    description: '管理知识库 MCP 对外服务与共享说明。'
  },
  {
    id: 'theme',
    label: '主题设置',
    description: '切换当前工作主题并查看主题预览。'
  }
]

// 信息消息（仅用于嵌入模型设置）
const infoMessage = ref('')

// 关闭弹窗
function handleClose(): void {
  infoMessage.value = ''
  configStore.clearMessages()
  emit('close')
}

// 主题变化处理（立即生效，无需保存）
function handleThemeChange(themeId: string): void {
  window.api.logger.info('[SettingsModal] 主题已切换', { themeId })
  configStore.successMessage = '主题已应用'
  setTimeout(() => {
    configStore.successMessage = ''
  }, 1500)
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  configStore.loadConfig()
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="sm-modal__overlay settings-overlay" @click.self="handleClose">
    <div class="sm-modal__surface settings-container">
      <div class="sm-pane-header settings-header">
        <div class="settings-header__info">
          <h2 class="settings-title">设置中心</h2>
        </div>
        <button class="sm-button close-btn" @click="handleClose">关闭</button>
      </div>

      <div class="sm-settings-layout settings-body">
        <aside class="sm-settings-nav settings-nav">
          <div class="sm-settings-nav__list">
            <button
              v-for="tab in settingsTabs"
              :key="tab.id"
              class="sm-settings-nav__item"
              :class="{ 'is-active': activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              <span class="sm-settings-nav__label">{{ tab.label }}</span>
              <span class="sm-settings-nav__meta">{{ tab.description }}</span>
            </button>
          </div>
        </aside>

        <section class="sm-settings-panel settings-panel">
          <div class="sm-settings-panel__body settings-content">
            <div v-if="loading" class="sm-settings-empty">正在加载当前配置...</div>

            <ModelSettings v-else-if="activeTab === 'model'" />

            <MCPSettings
              v-else-if="activeTab === 'mcp'"
              :error-message="errorMessage"
              :success-message="successMessage"
              @update:error-message="errorMessage = $event"
              @update:success-message="successMessage = $event"
              @mcp-updated="emit('mcp-updated')"
            />

            <EmbeddingModelSettings
              v-else-if="activeTab === 'embedding'"
              :error-message="errorMessage"
              :success-message="successMessage"
              :info-message="infoMessage"
              @update:error-message="errorMessage = $event"
              @update:success-message="successMessage = $event"
              @update:info-message="infoMessage = $event"
            />

            <PromptEngineeringSettings v-else-if="activeTab === 'prompt'" />

            <ThemeSettings
              v-else-if="activeTab === 'theme'"
              :model-value="themeConfig"
              @update:model-value="configStore.updateThemeConfig"
              @theme-change="handleThemeChange"
            />

            <KnowledgeMCPSettings
              v-else-if="activeTab === 'knowledge'"
              @update:error-message="errorMessage = $event"
              @update:success-message="successMessage = $event"
            />

            <PaperReaderSettings
              v-else-if="activeTab === 'paperReader'"
              :error-message="errorMessage"
              :success-message="successMessage"
              @update:error-message="errorMessage = $event"
              @update:success-message="successMessage = $event"
            />
          </div>
        </section>
      </div>

      <div v-if="errorMessage" class="sm-settings-feedback sm-settings-feedback--error">
        <span>{{ errorMessage }}</span>
        <button class="message-close" @click="errorMessage = ''">关闭</button>
      </div>
      <div v-if="successMessage" class="sm-settings-feedback sm-settings-feedback--success">
        <span>{{ successMessage }}</span>
        <button class="message-close" @click="successMessage = ''">关闭</button>
      </div>
      <div v-if="infoMessage" class="sm-settings-feedback sm-settings-feedback--info">
        <span>{{ infoMessage }}</span>
        <button class="message-close" @click="infoMessage = ''">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  z-index: 1000;
  overflow: hidden;
}

.settings-container {
  width: min(1100px, calc(100vw - 48px));
  height: min(750px, calc(100vh - 96px - env(safe-area-inset-top, 0px)));
  min-width: 400px;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--sm-color-surface-3);
  border-color: var(--sm-color-border-default);
  box-shadow: none;
}

.settings-header {
  flex-shrink: 0;
}

.settings-header__info {
  display: flex;
  flex-direction: column;
}

.settings-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
  letter-spacing: -0.01em;
}

.close-btn {
  min-width: 64px;
}

.settings-body {
  overflow: hidden;
}

.settings-content {
  background: var(--sm-color-surface-2);
}

.message-close {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: inherit;
  font-size: 12px;
  font-family: var(--sm-font-sans);
  padding: 0 8px;
  min-width: 44px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 10px;
}

.message-close:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-default);
}

@media (max-width: 1060px) {
  .settings-container {
    width: min(1050px, calc(100vw - 40px));
    height: min(700px, calc(100vh - 88px - env(safe-area-inset-top, 0px)));
  }
}

@media (max-width: 768px) {
  .settings-overlay {
    padding: calc(44px + env(safe-area-inset-top, 0px)) 12px 12px;
  }

  .settings-container {
    width: 100%;
    height: min(100%, calc(100vh - 56px - env(safe-area-inset-top, 0px)));
  }
}

@media (max-width: 600px) {
  .settings-title {
    font-size: 16px;
  }
}

@media (max-width: 480px) {
  .settings-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .close-btn {
    width: 100%;
  }
}
</style>
