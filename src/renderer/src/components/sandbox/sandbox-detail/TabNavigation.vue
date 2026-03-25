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
  <div v-if="visible" class="detail-tabs">
    <button
      class="tab-btn"
      :class="{ active: sandboxDetailTab === 'stats' }"
      @click="setDetailTab('stats')"
    >
      监控
    </button>
    <button
      class="tab-btn"
      :class="{ active: sandboxDetailTab === 'terminal' }"
      @click="setDetailTab('terminal')"
    >
      终端
    </button>
    <button
      class="tab-btn"
      :class="{ active: sandboxDetailTab === 'logs' }"
      @click="setDetailTab('logs')"
    >
      日志
    </button>
  </div>
</template>

<style scoped>
.detail-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  flex-shrink: 0;
}

.tab-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: none;
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background-color: var(--theme-bg);
  color: var(--theme-text);
}

.tab-btn.active {
  background-color: var(--theme-accent);
  color: var(--theme-bg);
}
</style>
