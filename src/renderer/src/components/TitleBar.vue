<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'

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
          <!-- 聊天 按钮 -->
          <button class="switcher-btn" :class="{ active: isChatView }" @click="switchView('chat')">
            <span>聊天</span>
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
          <svg width="16" height="16" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M919.6 405.6l-57.2-8c-12.7-1.8-23-10.4-28-22.1-11.3-26.7-25.7-51.7-42.9-74.5-7.7-10.2-10-23.5-5.2-35.3l21.7-53.5c6.7-16.4 0.2-35.3-15.2-44.1L669.1 96.6c-15.4-8.9-34.9-5.1-45.8 8.9l-35.4 45.3c-7.9 10.2-20.7 14.9-33.5 13.3-14-1.8-28.3-2.8-42.8-2.8-14.5 0-28.8 1-42.8 2.8-12.8 1.6-25.6-3.1-33.5-13.3l-35.4-45.3c-10.9-14-30.4-17.8-45.8-8.9L230.4 168c-15.4 8.9-21.8 27.7-15.2 44.1l21.7 53.5c4.8 11.9 2.5 25.1-5.2 35.3-17.2 22.8-31.7 47.8-42.9 74.5-5 11.8-15.3 20.4-28 22.1l-57.2 8C86 408 72.9 423 72.9 440.8v142.9c0 17.7 13.1 32.7 30.6 35.2l57.2 8c12.7 1.8 23 10.4 28 22.1 11.3 26.7 25.7 51.7 42.9 74.5 7.7 10.2 10 23.5 5.2 35.3l-21.7 53.5c-6.7 16.4-0.2 35.3 15.2 44.1L354 927.8c15.4 8.9 34.9 5.1 45.8-8.9l35.4-45.3c7.9-10.2 20.7-14.9 33.5-13.3 14 1.8 28.3 2.8 42.8 2.8 14.5 0 28.8-1 42.8-2.8 12.8-1.6 25.6 3.1 33.5 13.3l35.4 45.3c10.9 14 30.4 17.8 45.8 8.9l123.7-71.4c15.4-8.9 21.8-27.7 15.2-44.1l-21.7-53.5c-4.8-11.8-2.5-25.1 5.2-35.3 17.2-22.8 31.7-47.8 42.9-74.5 5-11.8 15.3-20.4 28-22.1l57.2-8c17.6-2.5 30.6-17.5 30.6-35.2V440.8c0.2-17.8-12.9-32.8-30.5-35.2z m-408 245.5c-76.7 0-138.9-62.2-138.9-138.9s62.2-138.9 138.9-138.9 138.9 62.2 138.9 138.9-62.2 138.9-138.9 138.9z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button
          class="tool-btn"
          :title="allSidebarsCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleAllSidebars"
        >
          <svg width="16" height="16" viewBox="0 0 1084 1024" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0 199.559529A199.559529 199.559529 0 0 1 199.559529 0h639.939765a199.559529 199.559529 0 0 1 199.55953 199.559529v603.557647a199.559529 199.559529 0 0 1-199.55953 199.499295H199.559529A199.559529 199.559529 0 0 1 0 803.056941V199.559529z m199.559529-101.677176c-56.139294 0-101.677176 45.537882-101.677176 101.677176v603.557647c0 56.139294 45.477647 101.616941 101.677176 101.616942h206.245647V97.882353H199.559529z m304.188236 0V904.734118h335.811764c56.079059 0 101.616941-45.537882 101.616942-101.677177V199.559529c0-56.079059-45.537882-101.616941-101.677177-101.616941H503.808z m-285.515294 181.308235h75.294117a48.911059 48.911059 0 1 1 0 97.882353h-75.294117a48.911059 48.911059 0 1 1 0-97.882353z m-48.911059 274.853647c0-27.105882 21.925647-48.971294 48.971294-48.971294h75.294118a48.911059 48.911059 0 1 1 0 97.882353h-75.294118a48.911059 48.911059 0 0 1-48.971294-48.971294"
              fill="currentColor"
            />
          </svg>
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
          <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect
              x="0"
              y="0"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
            />
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect
              x="2"
              y="2"
              width="8"
              height="8"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
            />
            <path d="M0 4h2v8h8v2H0z" fill="currentColor" />
          </svg>
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
    linear-gradient(135deg, var(--glass-white-02, rgba(255,255,255,0.02)) 0%, var(--glass-white-01, rgba(255,255,255,0.01)) 100%),
    linear-gradient(225deg, var(--glass-white-013, rgba(255,255,255,0.013)) 0%, var(--glass-white-003, rgba(255,255,255,0.003)) 100%),
    var(--theme-bg);
  backdrop-filter: blur(18px) saturate(190%) brightness(1.08);
  -webkit-backdrop-filter: blur(18px) saturate(190%) brightness(1.08);
  border-bottom: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
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
  background:
    linear-gradient(135deg, var(--glass-white-05, rgba(255,255,255,0.05)) 0%, var(--glass-white-027, rgba(255,255,255,0.027)) 100%);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-radius: var(--theme-radius-sm, 6px);
  padding: 2px;
  border: 1px solid var(--glass-white-1, rgba(255,255,255,0.1));
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
  background: var(--glass-white-08, rgba(255,255,255,0.08));
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
  background: var(--glass-white-08, rgba(255,255,255,0.08));
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
  background:
    linear-gradient(135deg, var(--glass-white-05, rgba(255,255,255,0.05)) 0%, var(--glass-white-027, rgba(255,255,255,0.027)) 100%);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-radius: var(--theme-radius-sm, 6px);
  padding: 2px;
  border: 1px solid var(--glass-white-1, rgba(255,255,255,0.1));
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
