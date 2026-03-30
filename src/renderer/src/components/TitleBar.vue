<script setup lang="ts">
import { computed } from 'vue'
import WindowControls from '@renderer/components/chrome/WindowControls.vue'
import WorkspaceToolbar from '@renderer/components/chrome/WorkspaceToolbar.vue'
import WorkspaceViewSwitcher from '@renderer/components/chrome/WorkspaceViewSwitcher.vue'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

const isMac = computed(() => {
  return window.electron?.process?.platform === 'darwin'
})

function handleOpenSettings(): void {
  emit('open-settings')
}
</script>

<template>
  <div class="sm-titlebar title-bar" :class="{ 'sm-titlebar--mac': isMac }">
    <div class="sm-titlebar__start">
      <WorkspaceToolbar @open-settings="handleOpenSettings" />
    </div>

    <div class="sm-titlebar__center">
      <WorkspaceViewSwitcher />
    </div>

    <div class="sm-titlebar__controls">
      <WindowControls />
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  min-width: 0;
}
</style>
