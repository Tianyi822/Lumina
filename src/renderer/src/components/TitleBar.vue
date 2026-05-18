<script setup lang="ts">
import WindowControls from '@renderer/components/chrome/WindowControls.vue'
import WorkspaceToolbar from '@renderer/components/chrome/WorkspaceToolbar.vue'
import WorkspaceViewSwitcher from '@renderer/components/chrome/WorkspaceViewSwitcher.vue'
import { useRuntimePlatform } from '@renderer/composables/useRuntimePlatform'
import styles from './TitleBar.module.css'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

const { usesNativeTrafficLights, usesCustomWindowControls } = useRuntimePlatform()

function handleOpenSettings(): void {
  emit('open-settings')
}
</script>

<template>
  <div :class="['sm-titlebar', styles.titleBar, { 'sm-titlebar--mac': usesNativeTrafficLights }]">
    <div class="sm-titlebar__start">
      <WorkspaceToolbar @open-settings="handleOpenSettings" />
    </div>

    <div class="sm-titlebar__center">
      <WorkspaceViewSwitcher />
    </div>

    <div class="sm-titlebar__controls">
      <WindowControls v-if="usesCustomWindowControls" />
    </div>
  </div>
</template>
