<script setup lang="ts">
import { computed } from 'vue'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher.vue'

defineProps<{
  count: number
  actionsKey?: string
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
    <div v-if="isMac" class="sm-sidebar-shell__chrome-action-hitbox" aria-hidden="true"></div>

    <div class="sm-sidebar-shell__switcher-row">
      <div class="sm-sidebar-shell__switcher-card">
        <WorkspaceViewSwitcher />
      </div>
      <span class="sm-sidebar-shell__count">{{ count }}</span>
    </div>

    <Transition name="sm-sidebar-actions-switch" mode="out-in" appear>
      <div
        v-if="$slots.actions"
        :key="actionsKey || 'sidebar-actions'"
        class="sm-sidebar-shell__actions"
      >
        <slot name="actions" />
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.sm-sidebar-shell__header {
  position: relative;
}

.sm-sidebar-shell__chrome-action-hitbox {
  position: absolute;
  top: 0;
  left: 74px;
  z-index: 1;
  width: 62px;
  height: 30px;
  -webkit-app-region: no-drag;
}
</style>
