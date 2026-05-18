<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useZustandStore } from './composables/useZustandStore'
import KnowledgePage from './pages/KnowledgePage.vue'
import LabPage from './pages/LabPage.vue'
import PaperReaderPage from './pages/PaperReaderPage.vue'
import NotificationCenter from './components/NotificationCenter.vue'
import SettingsModal from './components/SettingsModal.vue'
import SvgIcon from './components/icons/SvgIcon.vue'
import WindowControls from './components/chrome/WindowControls.vue'
import WorkspaceSidebarHost from './components/chrome/WorkspaceSidebarHost.vue'
import WorkspaceToolbar from './components/chrome/WorkspaceToolbar.vue'

// Composables
import { useLifecycle } from './composables/lifecycle/useLifecycle'
import { useRuntimePlatform } from './composables/useRuntimePlatform'
import { useTheme } from './composables/useTheme'

// Stores
import { useUIStateStore, useConfigStore, usePaperReaderStore } from './stores'
import appStyles from './App.module.css'

// ==================== 主题初始化 ====================
const { initTheme } = useTheme()

// ==================== UI 状态管理（Zustand）====================
const uiState = useZustandStore(useUIStateStore)

const { isMac, isWindows, usesCustomWindowControls } = useRuntimePlatform()

const currentView = computed(() => uiState.currentView)
const isKnowledgeView = computed(() => uiState.isKnowledgeView())
const isPaperView = computed(() => uiState.isPaperView())
const isCurrentSidebarCollapsed = computed(() => uiState.isCurrentSidebarCollapsed())

const workspacePageClasses = computed(() => ({
  [`sm-workspace-page--${currentView.value}`]: true,
  [appStyles.sidebarCollapsed]: isCurrentSidebarCollapsed.value,
  'sm-workspace-page--mac': isMac.value,
  [appStyles.windows]: isWindows.value
}))

// 配置 Store - 用于加载语音识别等配置
const configStore = useConfigStore()
const paperReaderStore = usePaperReaderStore()

// 设置弹窗状态（本地状态）
const showSettings = ref(false)

function openSettings(): void {
  showSettings.value = true
}

function closeSettings(): void {
  showSettings.value = false
}

function toggleSidebar(): void {
  uiState.toggleCurrentSidebar()
}

function handleMCPUpdated(): void {
  uiState.notifyMcpUpdate()
  uiState.loadConfigStatus()
}

// ==================== 视图切换监听 ====================
watch(
  () => uiState.currentView,
  (newView, oldView) => {
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
  paperReaderStore.loadPaperReaderPreferences()
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
  <div class="sm-app">
    <!-- 全局通知中心 -->
    <NotificationCenter />

    <!-- 主布局 -->
    <div :class="['sm-shell', 'sm-workspace-page', appStyles.workspacePage, workspacePageClasses]">
      <div :class="[appStyles.dragRegion]" aria-hidden="true"></div>
      <div :class="[appStyles.chromeActions]" aria-label="窗口快捷操作">
        <button
          :class="['sm-icon-button', appStyles.chromeButton]"
          title="设置"
          aria-label="打开设置"
          @click="openSettings"
        >
          <SvgIcon name="settings" :size="14" />
        </button>

        <button
          v-if="isPaperView"
          :class="['sm-icon-button', appStyles.chromeButton]"
          :title="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          :aria-label="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleSidebar"
        >
          <SvgIcon name="sidebar-toggle" :size="14" />
        </button>
      </div>

      <div v-if="usesCustomWindowControls" :class="[appStyles.winControls]">
        <WindowControls />
      </div>

      <WorkspaceSidebarHost />

      <div class="sm-workspace-main">
        <WorkspaceToolbar />

        <div class="sm-workspace-main__body sm-workspace-main__body--fill">
          <Transition name="sm-workspace-switch" mode="out-in" appear>
            <KeepAlive>
              <PaperReaderPage v-if="isPaperView" key="paper" />
              <KnowledgePage v-else-if="isKnowledgeView" key="knowledge" />
              <LabPage v-else key="lab" />
            </KeepAlive>
          </Transition>
        </div>
      </div>
    </div>

    <!-- 设置弹窗 -->
    <Transition name="sm-modal" appear>
      <SettingsModal v-if="showSettings" @close="closeSettings" @mcp-updated="handleMCPUpdated" />
    </Transition>
  </div>
</template>
