<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import ThemeSettings from './settings/ThemeSettings.vue'
import ModelSettings from './settings/ModelSettings.vue'
import MCPSettings from './settings/MCPSettings.vue'
import EmbeddingModelSettings from './settings/EmbeddingModelSettings.vue'
import KnowledgeMCPSettings from './settings/KnowledgeMCPSettings.vue'
import PaperReaderSettings from './settings/PaperReaderSettings.vue'
import ToolStatsSettings from './settings/ToolStatsSettings.vue'
import UpdateSettings from './settings/UpdateSettings.vue'
import { useConfigStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'mcp-updated'): void
}>()

type SettingsTabKey =
  | 'theme'
  | 'model'
  | 'mcp'
  | 'embedding'
  | 'knowledge'
  | 'toolStats'
  | 'paperReader'
  | 'update'

// 使用 configStore（Zustand）
const configState = useZustandStore(useConfigStore)
const notify = useNotification()

// 当前激活的 Tab
const activeTab = ref<SettingsTabKey>('model')

// 侧边栏滚动条：滚动时才显示
const navRef = ref<HTMLElement | null>(null)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

function handleNavScroll(): void {
  const el = navRef.value
  if (!el) return
  el.classList.add('is-scrolling')
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    el.classList.remove('is-scrolling')
    scrollTimeout = null
  }, 800)
}

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
    id: 'knowledge',
    label: '知识库服务',
    description: '管理知识库 MCP 对外服务与共享说明。'
  },
  {
    id: 'toolStats',
    label: '工具调用统计',
    description: '查看工具调用量、成功率和耗时分布。'
  },
  {
    id: 'theme',
    label: '主题设置',
    description: '切换当前工作主题并查看主题预览。'
  },
  {
    id: 'update',
    label: '升级版本',
    description: '检查应用更新并查看版本历史。'
  }
]

// 关闭弹窗
function handleClose(): void {
  emit('close')
}

// 主题变化处理（立即生效，无需保存）
function handleThemeChange(themeId: string): void {
  window.api.logger.info('[SettingsModal] 主题已切换', { themeId })
  notify.success('主题设置', '主题已应用', { source: 'settings' })
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  configState.loadConfig()
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  if (scrollTimeout) clearTimeout(scrollTimeout)
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
        <aside ref="navRef" class="sm-settings-nav settings-nav" @scroll="handleNavScroll">
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
            <div v-if="configState.loading" class="sm-settings-empty">正在加载当前配置...</div>

            <ModelSettings v-else-if="activeTab === 'model'" />

            <MCPSettings v-else-if="activeTab === 'mcp'" @mcp-updated="emit('mcp-updated')" />

            <EmbeddingModelSettings v-else-if="activeTab === 'embedding'" />
            <ThemeSettings
              v-else-if="activeTab === 'theme'"
              :model-value="configState.themeConfig"
              @update:model-value="configState.updateThemeConfig"
              @theme-change="handleThemeChange"
            />

            <KnowledgeMCPSettings v-else-if="activeTab === 'knowledge'" />

            <ToolStatsSettings v-else-if="activeTab === 'toolStats'" />

            <PaperReaderSettings v-else-if="activeTab === 'paperReader'" />

            <UpdateSettings v-else-if="activeTab === 'update'" />
          </div>
        </section>
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
