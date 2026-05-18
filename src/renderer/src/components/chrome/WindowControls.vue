<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import styles from './WindowControls.module.css'

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
  <div :class="styles['sm-window-controls']">
    <button
      :class="styles['sm-window-controls__button']"
      title="最小化"
      aria-label="最小化窗口"
      type="button"
      @click="handleMinimize"
    >
      <span
        :class="[styles['sm-window-controls__icon'], styles['sm-window-controls__icon--native']]"
        >&#xE921;</span
      >
    </button>

    <button
      :class="styles['sm-window-controls__button']"
      :title="isMaximized ? '还原' : '最大化'"
      :aria-label="isMaximized ? '还原窗口' : '最大化窗口'"
      type="button"
      @click="handleMaximize"
    >
      <span
        :class="[styles['sm-window-controls__icon'], styles['sm-window-controls__icon--native']]"
      >
        {{ maximizeIcon }}
      </span>
    </button>

    <button
      :class="[styles['sm-window-controls__button'], styles['sm-window-controls__button--close']]"
      title="关闭"
      aria-label="关闭窗口"
      type="button"
      @click="handleClose"
    >
      <span
        :class="[styles['sm-window-controls__icon'], styles['sm-window-controls__icon--native']]"
        >&#xE8BB;</span
      >
    </button>
  </div>
</template>
