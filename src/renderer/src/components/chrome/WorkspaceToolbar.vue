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
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(22, 24, 29, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 8px 20px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.sm-workspace-toolbar__button:hover {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(34, 38, 46, 0.44);
}
</style>
