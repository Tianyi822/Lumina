<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
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

// ==================== 主题初始化 ====================
const { initTheme } = useTheme()

// ==================== UI 状态管理（直接使用 Store）====================
const uiState = useUIStateStore()
const { currentView, isKnowledgeView, isPaperView, isCurrentSidebarCollapsed } =
  storeToRefs(uiState)

const { isMac, isWindows, usesCustomWindowControls } = useRuntimePlatform()

const workspacePageClasses = computed(() => ({
  [`sm-workspace-page--${currentView.value}`]: true,
  'sm-workspace-page--sidebar-collapsed': isCurrentSidebarCollapsed.value,
  'sm-workspace-page--mac': isMac.value,
  'sm-workspace-page--windows': isWindows.value
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
  () => currentView.value,
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
    <div class="sm-shell sm-workspace-page" :class="workspacePageClasses">
      <div class="sm-workspace-page__drag-region" aria-hidden="true"></div>
      <div class="sm-workspace-page__chrome-actions" aria-label="窗口快捷操作">
        <button
          class="sm-icon-button sm-workspace-page__chrome-button"
          title="设置"
          aria-label="打开设置"
          @click="openSettings"
        >
          <SvgIcon name="settings" :size="14" />
        </button>

        <button
          v-if="isPaperView"
          class="sm-icon-button sm-workspace-page__chrome-button"
          :title="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          :aria-label="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleSidebar"
        >
          <SvgIcon name="sidebar-toggle" :size="14" />
        </button>
      </div>

      <div v-if="usesCustomWindowControls" class="sm-workspace-page__win-controls">
        <WindowControls />
      </div>

      <WorkspaceSidebarHost />

      <div class="sm-workspace-main">
        <WorkspaceToolbar />

        <div class="sm-workspace-main__body sm-workspace-main__body--fill">
          <Transition name="sm-workspace-switch" mode="out-in" appear>
            <!-- 论文阅读器视图 -->
            <PaperReaderPage v-if="isPaperView" key="paper" />

            <!-- 知识库视图 -->
            <KnowledgePage v-else-if="isKnowledgeView" key="knowledge" />

            <!-- 实验室视图 -->
            <LabPage v-else key="lab" />
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

<style scoped>
.sm-workspace-page__drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--sm-space-3);
  z-index: 3;
  -webkit-app-region: drag;
  user-select: none;
}

.sm-workspace-page {
  --sm-workspace-chrome-actions-safe-width: 140px;
  --sm-window-controls-safe-width: 0px;
  --sm-window-control-button-width: 46px;
}

.sm-workspace-page--windows {
  --sm-window-controls-safe-width: calc(var(--sm-window-control-button-width) * 3);
}

.sm-workspace-page__chrome-actions {
  position: absolute;
  top: 12px;
  left: 90px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0;
  -webkit-app-region: no-drag;
  pointer-events: auto;
}

.sm-workspace-page__chrome-button {
  width: 24px;
  height: 30px;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  -webkit-app-region: no-drag;
}

.sm-workspace-page__chrome-button:hover,
.sm-workspace-page__chrome-button:active,
.sm-workspace-page__chrome-button:focus-visible {
  border-color: transparent;
  background: transparent;
  color: var(--sm-color-text-primary);
}

.sm-workspace-page--windows .sm-workspace-page__chrome-actions {
  top: var(--sm-space-3);
  left: calc(var(--sm-space-3) + var(--sm-space-4));
}

.sm-workspace-page--windows .sm-workspace-main::before {
  content: '';
  position: absolute;
  top: calc(var(--sm-space-3) * -1);
  left: 0;
  right: var(--sm-window-controls-safe-width);
  z-index: 3;
  height: var(--sm-titlebar-height);
  -webkit-app-region: drag;
  user-select: none;
}

.sm-workspace-page--windows .sm-workspace-page__win-controls {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 21;
  display: inline-flex;
  align-items: center;
  width: var(--sm-window-controls-safe-width);
  height: var(--sm-titlebar-height);
  -webkit-app-region: no-drag;
  pointer-events: auto;
}

.sm-workspace-page--windows .sm-workspace-page__drag-region {
  right: var(--sm-window-controls-safe-width);
}
</style>
