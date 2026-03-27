<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

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

const allSidebarsCollapsed = computed(() => {
  return sidebarCollapsed.value && sandboxSidebarCollapsed.value && knowledgeSidebarCollapsed.value
})

const isMaximized = ref(false)

const isMac = computed(() => {
  return window.electron?.process?.platform === 'darwin'
})

function openSettings(): void {
  emit('open-settings')
}

async function switchView(view: 'chat' | 'knowledge' | 'sandbox'): Promise<void> {
  if (currentView.value !== view) {
    await uiState.setCurrentView(view)
  }
}

function toggleAllSidebars(): void {
  const newState = !allSidebarsCollapsed.value
  uiState.setSidebarCollapsed(newState)
  uiState.setSandboxSidebarCollapsed(newState)
  uiState.setKnowledgeSidebarCollapsed(newState)
}

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
  <div class="sm-titlebar title-bar" :class="{ 'sm-titlebar--mac': isMac }">
    <div class="sm-titlebar__start">
      <div class="tool-buttons-group">
        <button class="tool-btn" title="设置" aria-label="打开设置" @click="openSettings">
          <SvgIcon name="settings" :size="14" />
        </button>
        <button
          class="tool-btn"
          :title="allSidebarsCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          :aria-label="allSidebarsCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleAllSidebars"
        >
          <SvgIcon name="sidebar-toggle" :size="14" />
        </button>
      </div>
    </div>

    <div class="sm-titlebar__center">
      <div class="view-switcher" role="tablist" aria-label="工作区切换">
        <button
          class="switcher-btn"
          :class="{ active: isChatView }"
          :aria-selected="isChatView"
          @click="switchView('chat')"
        >
          智能体
        </button>
        <button
          class="switcher-btn"
          :class="{ active: isKnowledgeView }"
          :aria-selected="isKnowledgeView"
          @click="switchView('knowledge')"
        >
          知识库
        </button>
        <button
          class="switcher-btn"
          :class="{ active: isSandboxView }"
          :aria-selected="isSandboxView"
          @click="switchView('sandbox')"
        >
          沙箱
        </button>
      </div>
    </div>

    <div class="sm-titlebar__controls">
      <div v-if="!isMac" class="title-bar-controls">
        <button
          class="title-bar-button"
          title="最小化"
          aria-label="最小化窗口"
          @click="handleMinimize"
        >
          <span class="button-icon">─</span>
        </button>
        <button
          class="title-bar-button"
          :title="isMaximized ? '还原' : '最大化'"
          :aria-label="isMaximized ? '还原窗口' : '最大化窗口'"
          @click="handleMaximize"
        >
          <SvgIcon v-if="!isMaximized" name="window-maximize" :size="12" />
          <SvgIcon v-else name="window-restore" :size="12" />
        </button>
        <button
          class="title-bar-button title-bar-button-close"
          title="关闭"
          aria-label="关闭窗口"
          @click="handleClose"
        >
          <span class="button-icon">×</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  min-width: 0;
}

.tool-buttons-group,
.title-bar-controls,
.view-switcher {
  -webkit-app-region: no-drag;
}

.view-switcher {
  display: flex;
  align-items: center;
  padding: 3px;
  gap: 2px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
}

.switcher-btn {
  min-width: 78px;
  height: 28px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.switcher-btn:hover:not(.active) {
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.switcher-btn.active {
  background: var(--sm-color-surface-active);
  border-color: var(--sm-color-border-default);
  color: var(--sm-color-text-primary);
}

.tool-buttons-group,
.title-bar-controls {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
}

.tool-btn,
.title-bar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.tool-btn:hover,
.title-bar-button:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.title-bar-button-close:hover {
  border-color: rgba(199, 120, 120, 0.42);
  background: rgba(199, 120, 120, 0.16);
  color: #ffffff;
}

.button-icon {
  line-height: 1;
  font-size: 12px;
}

@media (max-width: 760px) {
  .switcher-btn {
    min-width: 66px;
    padding: 0 10px;
  }
}
</style>
