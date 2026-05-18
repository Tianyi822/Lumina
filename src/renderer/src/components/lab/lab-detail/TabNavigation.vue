<script setup lang="ts">
/**
 * 实验室详情 Tab 导航组件
 */
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useUIStateStore } from '@renderer/stores'

type TabType = 'stats' | 'terminal' | 'logs'

withDefaults(
  defineProps<{
    visible: boolean
    showLogs?: boolean
  }>(),
  {
    showLogs: true
  }
)

const uiStateStore = useZustandStore(useUIStateStore)

function setDetailTab(tab: TabType): void {
  uiStateStore.setLabDetailTab(tab)
}
</script>

<template>
  <div v-if="visible" class="detail-tabs" role="tablist" aria-label="实验室详情视图">
    <button
      class="tab-btn"
      :class="{ 'is-active': uiStateStore.labDetailTab === 'stats' }"
      @click="setDetailTab('stats')"
    >
      监控
    </button>
    <button
      class="tab-btn"
      :class="{ 'is-active': uiStateStore.labDetailTab === 'terminal' }"
      @click="setDetailTab('terminal')"
    >
      终端
    </button>
    <button
      v-if="showLogs"
      class="tab-btn"
      :class="{ 'is-active': uiStateStore.labDetailTab === 'logs' }"
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
