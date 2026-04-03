<script setup lang="ts">
/**
 * 沙箱详情 Tab 导航组件
 */
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'

type TabType = 'stats' | 'terminal' | 'logs'

defineProps<{
  visible: boolean
}>()

const uiStateStore = useUIStateStore()
const { sandboxDetailTab } = storeToRefs(uiStateStore)

function setDetailTab(tab: TabType): void {
  uiStateStore.setSandboxDetailTab(tab)
}
</script>

<template>
  <div v-if="visible" class="detail-tabs" role="tablist" aria-label="沙箱详情视图">
    <button
      class="tab-btn"
      :class="{ 'is-active': sandboxDetailTab === 'stats' }"
      @click="setDetailTab('stats')"
    >
      监控
    </button>
    <button
      class="tab-btn"
      :class="{ 'is-active': sandboxDetailTab === 'terminal' }"
      @click="setDetailTab('terminal')"
    >
      终端
    </button>
    <button
      class="tab-btn"
      :class="{ 'is-active': sandboxDetailTab === 'logs' }"
      @click="setDetailTab('logs')"
    >
      日志
    </button>
  </div>
</template>

<style scoped>
.detail-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  flex-shrink: 0;
}

.tab-btn {
  min-height: 36px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.tab-btn:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-subtle);
  color: var(--sm-color-text-primary);
}

.tab-btn.is-active {
  background: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
  color: var(--sm-color-text-selected);
}
</style>
