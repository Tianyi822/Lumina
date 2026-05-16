<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useUIStateStore } from '@renderer/stores'
import { useContainerLogs as useContainerLogsComposable } from './lab-detail'
import ContainerLogs from './ContainerLogs.vue'

const props = defineProps<{
  isDockerReady: boolean
}>()

const containerStore = useContainerStore()
const uiStateStore = useUIStateStore()
const { selectedContainer } = storeToRefs(containerStore)
const { labDetailTab } = storeToRefs(uiStateStore)

const selectedContainerRef = computed(() => selectedContainer.value)
const { containerLogs, logsLoading, loadContainerLogs, handleRefreshLogs, handleExportLogs } =
  useContainerLogsComposable(selectedContainerRef)

watch(
  labDetailTab,
  async (tab) => {
    if (tab === 'logs' && selectedContainer.value) await loadContainerLogs()
  },
  { immediate: true }
)

watch(
  () => selectedContainer.value?.id,
  async (newId, oldId) => {
    if (newId && newId !== oldId && labDetailTab.value === 'logs') await loadContainerLogs()
  }
)
</script>

<template>
  <div v-if="!isDockerReady" class="detail-empty-state">
    <div class="sm-empty detail-empty-card">
      <h2>Docker 未就绪</h2>
      <p>本地 Docker 运行时不可用，容器日志功能暂时无法使用。</p>
    </div>
  </div>
  <div v-else-if="!selectedContainer" class="detail-empty-state">
    <div class="sm-empty detail-empty-card">
      <h2>日志尚未绑定容器</h2>
      <p>选中目标容器后，可在这里检索输出、导出日志并追踪最近的运行记录。</p>
    </div>
  </div>
  <ContainerLogs
    v-else
    :container-id="selectedContainer.id"
    :container-name="selectedContainer.names[0]?.replace(/^\//, '') || '未命名'"
    :logs="containerLogs"
    :loading="logsLoading"
    @refresh="handleRefreshLogs"
    @export="handleExportLogs"
  />
</template>
