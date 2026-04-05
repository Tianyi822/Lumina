<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useUIStateStore } from '@renderer/stores'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'

const emit = defineEmits<{
  (e: 'open-settings'): void
}>()

const uiStateStore = useUIStateStore()
const { isCurrentSidebarCollapsed, isPaperView } = storeToRefs(uiStateStore)

const paperReaderStore = usePaperReaderStore()
const { currentPaper } = storeToRefs(paperReaderStore)

const shouldAvoidMacWindowControls = computed(() => {
  return window.electron?.process?.platform === 'darwin' && isCurrentSidebarCollapsed.value
})

/** 论文文件名（去掉 .pdf 后缀） */
const paperFileName = computed(() => {
  const name = currentPaper.value?.fileName
  if (!name) return ''
  return name.replace(/\.pdf$/i, '')
})

function handleOpenSettings(): void {
  emit('open-settings')
}

function handleToggleSidebar(): void {
  uiStateStore.toggleCurrentSidebar()
}

/** 刷新论文 Markdown 内容 */
function handleRefreshMarkdown(): void {
  if (paperReaderStore.currentPaperId) {
    paperReaderStore.loadMarkdown(paperReaderStore.currentPaperId)
  }
}
</script>

<template>
  <div
    class="sm-workspace-toolbar"
    :class="{ 'sm-workspace-toolbar--avoid-window-controls': shouldAvoidMacWindowControls }"
  >
    <div class="sm-workspace-toolbar__controls">
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

      <button
        v-if="isPaperView"
        class="sm-icon-button sm-workspace-toolbar__button"
        title="刷新内容"
        aria-label="刷新论文内容"
        @click="handleRefreshMarkdown"
      >
        <SvgIcon name="refresh" :size="14" />
      </button>
    </div>

    <div v-if="isPaperView && paperFileName" class="sm-workspace-toolbar__paper-file">
      <span class="sm-workspace-toolbar__paper-name" :title="paperFileName">
        {{ paperFileName }}
      </span>
    </div>

    <div class="sm-workspace-toolbar__balance-spacer" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.sm-workspace-toolbar {
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
  align-items: center;
  column-gap: var(--sm-space-4);
  width: 100%;
  min-height: var(--sm-titlebar-height);
  margin-left: 0;
  transition: margin-left var(--sm-transition-medium);
  -webkit-app-region: no-drag;
}

.sm-workspace-toolbar--avoid-window-controls {
  margin-left: 84px;
}

.sm-workspace-toolbar__controls {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
  justify-self: start;
}

.sm-workspace-toolbar__button {
  width: 32px;
  height: 32px;
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
}

.sm-workspace-toolbar__button:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.sm-workspace-toolbar__paper-file {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 100%;
  justify-self: center;
}

.sm-workspace-toolbar__paper-name {
  max-width: min(100%, 420px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-color-text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.sm-workspace-toolbar__balance-spacer {
  min-width: 0;
}
</style>
