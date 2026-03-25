<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import TitleBar from './components/TitleBar.vue'
import ChatPage from './pages/ChatPage.vue'
import KnowledgePage from './pages/KnowledgePage.vue'
import SandboxPage from './pages/SandboxPage.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import SettingsModal from './components/SettingsModal.vue'

// Composables
import { useLifecycle } from './composables/lifecycle/useLifecycle'
import { useTheme } from './composables/useTheme'

// Stores
import { useUIStateStore, useConfigStore } from './stores'

// ==================== 主题初始化 ====================
const { initTheme } = useTheme()

// ==================== UI 状态管理（直接使用 Store）====================
const uiState = useUIStateStore()
const { currentView, isChatView, isKnowledgeView, isSandboxView, configError } =
  storeToRefs(uiState)

// 配置 Store - 用于加载语音识别等配置
const configStore = useConfigStore()

// 设置弹窗状态（本地状态）
const showSettings = ref(false)

function openSettings(): void {
  showSettings.value = true
}

function closeSettings(): void {
  showSettings.value = false
}

function dismissError(): void {
  uiState.dismissConfigError()
}

function handleMCPUpdated(): void {
  uiState.notifyMcpUpdate()
  uiState.loadConfigStatus()
}

// ==================== 视图切换监听 ====================
watch(
  () => currentView,
  async (newView, oldView) => {
    window.api.logger.debug('[App] 视图切换', {
      from: oldView,
      to: newView
    })
  },
  { immediate: true }
)

// ==================== 生命周期 ====================
useLifecycle({
  loadConfigStatus: () => uiState.loadConfigStatus(),
  setupStreamListener: undefined,
  cleanupStreamListener: undefined,
  loadSessionList: undefined,
  loadKnowledgeBases: undefined
})

// 初始化主题和配置
onMounted(async () => {
  // 先加载配置（包含语音识别配置等）
  await configStore.loadConfig()
  // 再初始化主题
  await initTheme()
})

// ==================== 全局外部链接拦截 ====================
/**
 * 拦截页面内所有 <a> 标签点击，将 http/https 外部链接通过系统默认浏览器打开
 * 防止链接在 Electron 窗口内导航
 */
function handleGlobalLinkClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (!anchor || !anchor.href) return

  try {
    const url = new URL(anchor.href)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      event.preventDefault()
      window.api.window.openExternal(anchor.href)
    }
  } catch {
    // 非合法 URL，忽略
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalLinkClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleGlobalLinkClick, true)
})
</script>

<template>
  <div class="app-container">
    <!-- 自定义标题栏 -->
    <TitleBar @open-settings="openSettings" />

    <!-- 配置加载错误提示(仅在加载失败时显示) -->
    <ErrorBanner :error="configError" @dismiss="dismissError" />

    <!-- 主布局 -->
    <div class="app-layout">
      <!-- Chat 视图 -->
      <ChatPage v-if="isChatView" @open-settings="openSettings" />

      <!-- 知识库视图 -->
      <KnowledgePage v-else-if="isKnowledgeView" />

      <!-- 沙箱视图 -->
      <SandboxPage v-else-if="isSandboxView" />
    </div>

    <!-- 设置弹窗 -->
    <SettingsModal v-if="showSettings" @close="closeSettings" @mcp-updated="handleMCPUpdated" />
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--theme-font);
  background-color: var(--theme-bg);
  color: var(--theme-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 主布局 */
.app-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
