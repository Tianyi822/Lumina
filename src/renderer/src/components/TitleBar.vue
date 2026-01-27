<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

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
const windowTitle = ref('Sparrow Manus')

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
    <!-- 窗口控制按钮（仅 Windows/Linux） -->
    <div v-if="!isMac" class="title-bar-controls">
      <!-- Windows/Linux: 矩形按钮 -->
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

    <!-- 窗口标题（可选） -->
    <div class="title-bar-title">
      <span>{{ windowTitle }}</span>
    </div>

    <!-- 窗口拖动区域 -->
    <div class="title-bar-drag-region"></div>
  </div>
</template>

<style scoped>
.title-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: var(--title-bar-height, 32px);
  background-color: var(--theme-bg);
  border-bottom: 1px solid var(--theme-border);
  user-select: none;
  -webkit-app-region: drag; /* 允许拖动窗口 */
}

/* macOS 样式 */
.title-bar.is-mac {
  /* macOS 上，系统原生按钮会自动显示在左上角 */
  /* 我们只需要为原生按钮留出空间 */
  padding-left: 80px; /* 为原生按钮区域预留空间 */
  padding-right: 16px;
}

/* Windows/Linux 样式 */
.title-bar:not(.is-mac) .title-bar-controls {
  display: flex;
  margin-left: auto; /* 按钮靠右 */
  height: 100%;
}

.title-bar:not(.is-mac) .title-bar-button {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
  -webkit-app-region: no-drag; /* 按钮不参与拖动 */
}

.title-bar:not(.is-mac) .title-bar-button .button-icon {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title-bar:not(.is-mac) .title-bar-button:hover {
  background-color: var(--theme-bg-hover);
}

.title-bar:not(.is-mac) .title-bar-button-close:hover {
  background-color: #e81123;
}

.title-bar:not(.is-mac) .title-bar-button-close:hover .button-icon {
  color: white;
}

/* 窗口标题 */
.title-bar-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: var(--theme-text-secondary);
  font-family: var(--theme-font);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

/* macOS 上的标题不需要偏移，因为使用的是原生按钮 */
.title-bar.is-mac .title-bar-title {
  left: 50%;
}

/* 窗口拖动区域 */
.title-bar-drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  -webkit-app-region: drag;
  pointer-events: none;
}

/* 确保按钮不在拖动区域内 */
.title-bar-controls {
  position: relative;
  z-index: 1;
}

.title-bar-controls .title-bar-button {
  -webkit-app-region: no-drag;
}

/* 图标 SVG 样式 */
.title-bar-button svg {
  display: block;
}
</style>
