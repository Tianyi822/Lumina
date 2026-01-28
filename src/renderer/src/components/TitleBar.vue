<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

type ViewMode = 'chat' | 'knowledge'

/**
 * 组件属性
 */
const props = defineProps<{
  modelValue?: ViewMode
}>()

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'update:modelValue', value: ViewMode): void
}>()

/**
 * 当前视图模式
 */
const currentView = computed({
  get: () => props.modelValue ?? 'chat',
  set: (value: ViewMode) => emit('update:modelValue', value)
})

/**
 * 窗口是否最大化
 */
const isMaximized = ref(false)

/**
 * 当前平台是否为 macOS
 */
const isMac = computed(() => {
  // 在渲染进程中通过 window.electron.process.platform 获取平台信息
  return window.electron?.process?.platform === 'darwin'
})

/**
 * 窗口标题（可以根据需要动态修改）
 */
// const windowTitle = ref('Sparrow Manus')

/**
 * 切换视图
 */
function switchView(view: ViewMode): void {
  if (currentView.value !== view) {
    currentView.value = view
  }
}

/**
 * 窗口控制操作
 */
async function handleMinimize(): Promise<void> {
  await window.api.window.minimize()
}

async function handleMaximize(): Promise<void> {
  await window.api.window.maximize()
  // 更新状态
  isMaximized.value = await window.api.window.isMaximized()
}

async function handleClose(): Promise<void> {
  await window.api.window.close()
}

/**
 * 监听窗口最大化状态变化
 */
let unsubscribeMaximizedChanged: (() => void) | null = null

onMounted(async () => {
  // 初始化窗口状态
  isMaximized.value = await window.api.window.isMaximized()

  // 监听窗口最大化状态变化
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
    <!-- 左侧占位（Windows/Linux）或 macOS 预留空间 -->
    <div class="title-bar-left-spacer"></div>

    <!-- 中间：视图切换器 (Chat | 知识库) -->
    <div class="view-switcher">
      <div class="switcher-container">
        <!-- 滑块背景 -->
        <div
          class="switcher-slider"
          :class="{ 'is-knowledge': currentView === 'knowledge' }"
        ></div>
        <!-- Chat 按钮 -->
        <button
          class="switcher-btn"
          :class="{ active: currentView === 'chat' }"
          @click="switchView('chat')"
        >
          <span>Chat</span>
        </button>
        <!-- 知识库 按钮 -->
        <button
          class="switcher-btn"
          :class="{ active: currentView === 'knowledge' }"
          @click="switchView('knowledge')"
        >
          <span>知识库</span>
        </button>
      </div>
    </div>

    <!-- 右侧：窗口控制按钮（仅 Windows/Linux） -->
    <div v-if="!isMac" class="title-bar-controls">
      <button
        class="title-bar-button title-bar-button-minimize"
        @click="handleMinimize"
        title="最小化"
      >
        <span class="button-icon">─</span>
      </button>
      <button
        class="title-bar-button title-bar-button-maximize"
        @click="handleMaximize"
        :title="isMaximized ? '还原' : '最大化'"
      >
        <span class="button-icon">
          <svg
            v-if="!isMaximized"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <rect x="0" y="0" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1"/>
          </svg>
          <svg
            v-else
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>
            <path d="M0 4h2v8h8v2H0z" fill="currentColor"/>
          </svg>
        </span>
      </button>
      <button
        class="title-bar-button title-bar-button-close"
        @click="handleClose"
        title="关闭"
      >
        <span class="button-icon">×</span>
      </button>
    </div>

    <!-- macOS 右侧占位 -->
    <div v-else class="title-bar-right-spacer"></div>

    <!-- 窗口拖动区域（排除可交互元素） -->
    <div class="title-bar-drag-region"></div>
  </div>
</template>

<style scoped>
.title-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--title-bar-height, 32px);
  background-color: var(--theme-bg);
  border-bottom: 1px solid var(--theme-border);
  user-select: none;
  -webkit-app-region: drag; /* 允许拖动窗口 */
}

/* macOS 样式 */
.title-bar.is-mac {
  padding-left: 80px; /* 为原生按钮区域预留空间 */
}

/* 左侧占位 */
.title-bar-left-spacer {
  width: 138px; /* 与右侧控制按钮宽度一致，保持切换器居中 */
  flex-shrink: 0;
}

/* macOS 左侧占位需要更小，因为按钮在左边 */
.title-bar.is-mac .title-bar-left-spacer {
  width: 0;
}

/* 右侧占位（macOS） */
.title-bar-right-spacer {
  width: 80px;
  flex-shrink: 0;
}

/* Windows/Linux 样式 */
.title-bar-controls {
  display: flex;
  height: 100%;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
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
  transition: background-color 0.15s ease;
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 3;
}

.title-bar-controls .title-bar-button .button-icon {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title-bar-controls .title-bar-button:hover {
  background-color: var(--theme-bg-hover);
}

.title-bar-controls .title-bar-button-close:hover {
  background-color: #e81123;
}

.title-bar-controls .title-bar-button-close:hover .button-icon {
  color: white;
}

/* 窗口拖动区域 - 只在两侧拖动 */
.title-bar-drag-region {
  position: absolute;
  top: 0;
  left: 138px; /* 左侧占位宽度 */
  right: 138px; /* 右侧占位宽度 */
  bottom: 0;
  -webkit-app-region: drag;
  pointer-events: auto;
  z-index: 1;
}

/* 图标 SVG 样式 */
.title-bar-button svg {
  display: block;
}

/* ==================== 视图切换器样式 ==================== */
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
  background-color: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  pointer-events: auto;
  height: 20px;
  box-sizing: border-box;
}

/* 滑块 */
.switcher-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  background-color: rgba(63, 185, 80, 0.25);
  border-radius: 3px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.switcher-slider.is-knowledge {
  transform: translateX(100%);
}

/* 切换按钮 */
.switcher-btn {
  position: relative;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-text-secondary, #8b949e);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
  font-family: var(--theme-font);
  white-space: nowrap;
  -webkit-app-region: no-drag;
  z-index: 11;
  user-select: none;
  pointer-events: auto;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  line-height: 16px;
}

.switcher-btn span {
  display: inline-block;
  line-height: 1;
  margin-top: 1px;
}

.switcher-btn:hover {
  color: var(--theme-text, #c9d1d9);
}

.switcher-btn.active {
  color: var(--theme-accent, #3fb950);
}

/* macOS 拖动区域调整 */
.title-bar.is-mac .title-bar-drag-region {
  left: 80px;
  right: 80px;
}

/* 响应式：当窗口很小时调整 */
@media (max-width: 600px) {
  .title-bar-left-spacer {
    width: 60px;
  }
  
  .title-bar-drag-region {
    left: 60px;
    right: 138px;
  }
  
  .switcher-btn {
    padding: 2px 8px;
    font-size: 11px;
  }
}
</style>
