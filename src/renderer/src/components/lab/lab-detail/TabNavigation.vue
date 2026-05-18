<script setup lang="ts">
/**
 * 实验室详情 Tab 导航组件
 */
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useUIStateStore } from '@renderer/stores'
import styles from './TabNavigation.module.css'

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
  <div v-if="visible" :class="styles['detail-tabs']" role="tablist" aria-label="实验室详情视图">
    <button
      :class="[styles['tab-btn'], { [styles['is-active']]: uiStateStore.labDetailTab === 'stats' }]"
      @click="setDetailTab('stats')"
    >
      监控
    </button>
    <button
      :class="[
        styles['tab-btn'],
        { [styles['is-active']]: uiStateStore.labDetailTab === 'terminal' }
      ]"
      @click="setDetailTab('terminal')"
    >
      终端
    </button>
    <button
      v-if="showLogs"
      :class="[styles['tab-btn'], { [styles['is-active']]: uiStateStore.labDetailTab === 'logs' }]"
      @click="setDetailTab('logs')"
    >
      日志
    </button>
  </div>
</template>
