<script setup lang="ts">
import { computed } from 'vue'
import WindowControls from './WindowControls.vue'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher.vue'

defineProps<{
  count: number
}>()

const isMac = computed(() => {
  return window.electron?.process?.platform === 'darwin'
})
</script>

<template>
  <header
    class="sm-sidebar-shell__header sm-sidebar-shell__header--chrome"
    :class="{ 'sm-sidebar-shell__header--chrome-mac': isMac }"
  >
    <WindowControls />

    <div class="sm-sidebar-shell__switcher-row">
      <div class="sm-sidebar-shell__switcher-card">
        <WorkspaceViewSwitcher />
      </div>
      <span class="sm-sidebar-shell__count">{{ count }}</span>
    </div>

    <div v-if="$slots.actions" class="sm-sidebar-shell__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
