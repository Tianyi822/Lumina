<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

// ==================== Emits ====================
const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

// ==================== Stores ====================
const uiState = useUIStateStore()
const {
  currentView,
  isChatView,
  isKnowledgeView,
  isSandboxView,
  sidebarCollapsed,
  sandboxSidebarCollapsed,
  knowledgeSidebarCollapsed
} = storeToRefs(uiState)

// ==================== Computed ====================

/**
 * 是否所有侧边栏都折叠
 */
const allSidebarsCollapsed = computed(() => {
  return sidebarCollapsed.value && sandboxSidebarCollapsed.value && knowledgeSidebarCollapsed.value
})

// ==================== Methods ====================

/**
 * 打开设置
 */
function openSettings(): void {
  emit('open-settings')
}

/**
 * 窗口是否最大化
 */
const isMaximized = ref(false)

/**
 * 当前平台是否为 macOS
 */
const isMac = computed(() => {
  return window.electron?.process?.platform === 'darwin'
})

/**
 * 切换视图
 */
async function switchView(view: 'chat' | 'knowledge' | 'sandbox'): Promise<void> {
  if (currentView.value !== view) {
    await uiState.setCurrentView(view)
  }
}

/**
 * 切换所有侧边栏
 */
function toggleAllSidebars(): void {
  const newState = !allSidebarsCollapsed.value
  uiState.setSidebarCollapsed(newState)
  uiState.setSandboxSidebarCollapsed(newState)
  uiState.setKnowledgeSidebarCollapsed(newState)
}

/**
 * 窗口控制操作
 */
async function handleMinimize(): Promise<void> {
  await window.api.window.minimize()
}

async function handleMaximize(): Promise<void> {
  await window.api.window.maximize()
  isMaximized.value = await window.api.window.isMaximized()
}

async function handleClose(): Promise<void> {
  await window.api.window.close()
}

// ==================== 生命周期 ====================
let unsubscribeMaximizedChanged: (() => void) | null = null

onMounted(async () => {
  isMaximized.value = await window.api.window.isMaximized()
  unsubscribeMaximizedChanged = window.api.window.onMaximizedChanged((maximized) => {
    isMaximized.value = maximized
  })
})

onUnmounted(() => {
  if (unsubscribeMaximizedChanged) {
    unsubscribeMaximizedChanged()
  }
})
</script>

<template>
  <div class="title-bar" :class="{ 'is-mac': isMac }">
    <!-- 左侧弹性占位 -->
    <div class="title-bar-left-spacer"></div>

    <!-- 中间区域：视图切换器 + 设置按钮 -->
    <div class="title-bar-center-section">
      <!-- 视图切换器 (聊天 | 知识库 | 沙箱) -->
      <div class="view-switcher">
        <div class="switcher-container">
          <!-- 滑块背景 -->
          <div
            class="switcher-slider"
            :class="{
              'is-knowledge': isKnowledgeView,
              'is-sandbox': isSandboxView
            }"
          ></div>
          <!-- 智能体 按钮 -->
          <button class="switcher-btn" :class="{ active: isChatView }" @click="switchView('chat')">
            <span>智能体</span>
          </button>
          <!-- 知识库 按钮 -->
          <button
            class="switcher-btn"
            :class="{ active: isKnowledgeView }"
            @click="switchView('knowledge')"
          >
            <span>知识库</span>
          </button>
          <!-- 沙箱 按钮 -->
          <button
            class="switcher-btn"
            :class="{ active: isSandboxView }"
            @click="switchView('sandbox')"
          >
            <span>沙箱</span>
          </button>
        </div>
      </div>

      <!-- 工具按钮组 -->
      <div class="tool-buttons-group">
        <button class="tool-btn" title="设置" @click="openSettings">
          <SvgIcon name="settings" :size="14" />
        </button>
        <button
          class="tool-btn"
          :title="allSidebarsCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleAllSidebars"
        >
          <SvgIcon name="sidebar-toggle" :size="14" />
        </button>
      </div>
    </div>

    <!-- 右侧：窗口控制按钮（仅 Windows/Linux） -->
    <div v-if="!isMac" class="title-bar-controls">
      <button
        class="title-bar-button title-bar-button-minimize"
        title="最小化"
        @click="handleMinimize"
      >
        <span class="button-icon">─</span>
      </button>
      <button
        class="title-bar-button title-bar-button-maximize"
        :title="isMaximized ? '还原' : '最大化'"
        @click="handleMaximize"
      >
        <span class="button-icon">
          <SvgIcon v-if="!isMaximized" name="window-maximize" :size="12" />
          <SvgIcon v-else name="window-restore" :size="12" />
        </span>
      </button>
      <button class="title-bar-button title-bar-button-close" title="关闭" @click="handleClose">
        <span class="button-icon">×</span>
      </button>
    </div>

    <!-- macOS 右侧占位 -->
    <div v-else class="title-bar-right-spacer"></div>
  </div>
</template>

<style scoped>
.title-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--title-bar-height, 38px);
  background:
    linear-gradient(
      135deg,
      var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
      var(--glass-white-01, rgba(255, 255, 255, 0.01)) 100%
    ),
    linear-gradient(
      225deg,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 0%,
      var(--glass-white-003, rgba(255, 255, 255, 0.003)) 100%
    ),
    var(--theme-bg);
  backdrop-filter: blur(18px) saturate(190%) brightness(1.08);
  -webkit-backdrop-filter: blur(18px) saturate(190%) brightness(1.08);
  border-bottom: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
  user-select: none;
  -webkit-app-region: drag;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* macOS 样式 */
.title-bar.is-mac {
  padding-left: 80px;
  border-bottom: 1px solid var(--theme-border);
}

.title-bar-left-spacer {
  flex: 1;
  min-width: 0;
}

.title-bar.is-mac .title-bar-left-spacer {
  flex: 0 0 auto;
}

.title-bar-center-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.title-bar-right-spacer {
  flex: 1;
  min-width: 0;
}

.title-bar-controls {
  display: flex;
  height: 100%;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

/* 工具按钮组 - 玻璃效果 */
.tool-buttons-group {
  display: flex;
  align-items: center;
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-radius: var(--theme-radius-sm, 6px);
  padding: 2px;
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  gap: 0;
  height: 26px;
  box-sizing: border-box;
}

.tool-btn {
  height: 100%;
  padding: 0 7px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  -webkit-app-region: no-drag;
  border-radius: 4px;
  color: var(--theme-text-tertiary);
}

.tool-btn:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  color: var(--theme-text);
}

.tool-btn svg {
  display: block;
  width: 14px;
  height: 14px;
}

.title-bar-controls .title-bar-button {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 3;
}

.title-bar-controls .title-bar-button .button-icon {
  color: var(--theme-text-tertiary);
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title-bar-controls .title-bar-button:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.title-bar-controls .title-bar-button:hover .button-icon {
  color: var(--theme-text);
}

.title-bar-controls .title-bar-button-close:hover {
  background-color: #e81123;
}

.title-bar-controls .title-bar-button-close:hover .button-icon {
  color: white;
}

.title-bar-button svg {
  display: block;
}

/* ==================== 视图切换器 - 玻璃效果 ==================== */
.view-switcher {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  pointer-events: auto;
  height: 100%;
}

.switcher-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-radius: var(--theme-radius-sm, 6px);
  padding: 2px;
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  pointer-events: auto;
  height: 26px;
  box-sizing: border-box;
}

/* 滑块 - 使用主题色 */
.switcher-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc((100% - 4px) / 3);
  height: calc(100% - 4px);
  background: rgba(99, 102, 241, 0.2);
  border-radius: 4px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.switcher-slider.is-knowledge {
  transform: translateX(100%);
}

.switcher-slider.is-sandbox {
  transform: translateX(200%);
}

.switcher-btn {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  font-family: var(--theme-font);
  white-space: nowrap;
  -webkit-app-region: no-drag;
  z-index: 11;
  user-select: none;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.switcher-btn span {
  display: contents;
}

.switcher-btn:hover {
  color: var(--theme-text-secondary);
}

.switcher-btn.active {
  color: var(--theme-accent);
}

@media (max-width: 600px) {
  .title-bar-center-section {
    gap: 4px;
  }

  .switcher-btn {
    padding: 0 8px;
    font-size: 11px;
  }
}
</style>
