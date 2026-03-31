<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const isMaximized = ref(false)

const isMac = computed(() => {
  return window.electron?.process?.platform === 'darwin'
})

const shouldRenderCustomControls = computed(() => {
  return !isMac.value
})

async function syncMaximizedState(): Promise<void> {
  isMaximized.value = await window.api.window.isMaximized()
}

async function handleMinimize(): Promise<void> {
  await window.api.window.minimize()
}

async function handleMaximize(): Promise<void> {
  await window.api.window.maximize()
  await syncMaximizedState()
}

async function handleClose(): Promise<void> {
  await window.api.window.close()
}

let unsubscribeMaximizedChanged: (() => void) | null = null

onMounted(async () => {
  if (!shouldRenderCustomControls.value) {
    return
  }

  await syncMaximizedState()
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
  <div v-if="shouldRenderCustomControls" class="sm-window-controls">
    <button
      class="sm-window-controls__button"
      title="最小化"
      aria-label="最小化窗口"
      @click="handleMinimize"
    >
      <span class="sm-window-controls__icon">─</span>
    </button>

    <button
      class="sm-window-controls__button"
      :title="isMaximized ? '还原' : '最大化'"
      :aria-label="isMaximized ? '还原窗口' : '最大化窗口'"
      @click="handleMaximize"
    >
      <SvgIcon v-if="!isMaximized" name="window-maximize" :size="12" />
      <SvgIcon v-else name="window-restore" :size="12" />
    </button>

    <button
      class="sm-window-controls__button sm-window-controls__button--close"
      title="关闭"
      aria-label="关闭窗口"
      @click="handleClose"
    >
      <span class="sm-window-controls__icon">×</span>
    </button>
  </div>
</template>

<style scoped>
.sm-window-controls {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-height: var(--sm-titlebar-height);
  -webkit-app-region: no-drag;
}

.sm-window-controls__button {
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

.sm-window-controls__button:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.sm-window-controls__button--close:hover {
  border-color: rgba(199, 120, 120, 0.42);
  background: rgba(199, 120, 120, 0.16);
  color: #ffffff;
}

.sm-window-controls__icon {
  line-height: 1;
  font-size: 12px;
}
</style>
