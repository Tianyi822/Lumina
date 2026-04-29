<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const isMaximized = ref(false)
const maximizeIcon = computed(() => (isMaximized.value ? '\uE923' : '\uE922'))

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
  <div class="sm-window-controls">
    <button
      class="sm-window-controls__button"
      title="最小化"
      aria-label="最小化窗口"
      type="button"
      @click="handleMinimize"
    >
      <span class="sm-window-controls__icon sm-window-controls__icon--native">&#xE921;</span>
    </button>

    <button
      class="sm-window-controls__button"
      :title="isMaximized ? '还原' : '最大化'"
      :aria-label="isMaximized ? '还原窗口' : '最大化窗口'"
      type="button"
      @click="handleMaximize"
    >
      <span class="sm-window-controls__icon sm-window-controls__icon--native">
        {{ maximizeIcon }}
      </span>
    </button>

    <button
      class="sm-window-controls__button sm-window-controls__button--close"
      title="关闭"
      aria-label="关闭窗口"
      type="button"
      @click="handleClose"
    >
      <span class="sm-window-controls__icon sm-window-controls__icon--native">&#xE8BB;</span>
    </button>
  </div>
</template>

<style scoped>
.sm-window-controls {
  display: inline-flex;
  align-items: center;
  gap: 0;
  height: var(--sm-titlebar-height);
  line-height: 1;
  overflow: hidden;
  -webkit-app-region: no-drag;
  user-select: none;
}

.sm-window-controls__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sm-window-control-button-width, 46px);
  height: var(--sm-titlebar-height);
  flex: 0 0 var(--sm-window-control-button-width, 46px);
  line-height: 1;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.sm-window-controls__button:hover,
.sm-window-controls__button:focus-visible {
  background: color-mix(in srgb, var(--sm-color-text-primary) 10%, transparent);
  color: var(--sm-color-text-primary);
  outline: none;
}

.sm-window-controls__button:active {
  background: color-mix(in srgb, var(--sm-color-text-primary) 16%, transparent);
}

.sm-window-controls__button--close:hover,
.sm-window-controls__button--close:focus-visible {
  background: #c42b1c;
  color: #ffffff;
}

.sm-window-controls__icon {
  line-height: 1;
  font-size: 13px;
}

.sm-window-controls__icon--native {
  font-family: 'Segoe Fluent Icons', 'Segoe MDL2 Assets', sans-serif;
  font-size: 10px;
  font-weight: 400;
}
</style>
