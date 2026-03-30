<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useUIStateStore } from '@renderer/stores'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

const uiStateStore = useUIStateStore()
const { isCurrentSidebarCollapsed } = storeToRefs(uiStateStore)

const shouldAvoidMacWindowControls = computed(() => {
  return window.electron?.process?.platform === 'darwin' && isCurrentSidebarCollapsed.value
})

function handleOpenSettings(): void {
  emit('open-settings')
}

function handleToggleSidebar(): void {
  uiStateStore.toggleCurrentSidebar()
}
</script>

<template>
  <div
    class="sm-workspace-toolbar"
    :class="{ 'sm-workspace-toolbar--avoid-window-controls': shouldAvoidMacWindowControls }"
  >
    <button
      class="sm-icon-button sm-workspace-toolbar__button"
      title="设置"
      aria-label="打开设置"
      @click="handleOpenSettings"
    >
      <SvgIcon name="settings" :size="14" />
    </button>

    <button
      class="sm-icon-button sm-workspace-toolbar__button"
      :title="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
      :aria-label="isCurrentSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
      @click="handleToggleSidebar"
    >
      <SvgIcon name="sidebar-toggle" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.sm-workspace-toolbar {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
  margin-left: 0;
  transition: margin-left var(--sm-transition-medium);
  -webkit-app-region: no-drag;
}

.sm-workspace-toolbar--avoid-window-controls {
  margin-left: 84px;
}

.sm-workspace-toolbar__button {
  width: 32px;
  height: 32px;
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
}

.sm-workspace-toolbar__button:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}
</style>
