<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useContainerStore, useUIStateStore } from '@renderer/stores'
import { useContainerLogs as useContainerLogsComposable } from './lab-detail'
import ContainerLogs from './ContainerLogs.vue'
import LabDetailEmptyState from './LabDetailEmptyState.vue'

defineProps<{
  isDockerReady: boolean
}>()

const containerStore = useContainerStore()
const uiStateStore = useZustandStore(useUIStateStore)
const { selectedContainer } = storeToRefs(containerStore)

const selectedContainerRef = computed(() => selectedContainer.value)
const { containerLogs, logsLoading, loadContainerLogs, handleRefreshLogs, handleExportLogs } =
  useContainerLogsComposable(selectedContainerRef)

watch(
  () => uiStateStore.labDetailTab,
  async (tab) => {
    if (tab === 'logs' && selectedContainer.value) await loadContainerLogs()
  },
  { immediate: true }
)

watch(
  () => selectedContainer.value?.id,
  async (newId, oldId) => {
    if (newId && newId !== oldId && uiStateStore.labDetailTab === 'logs') await loadContainerLogs()
  }
)
</script>

<template>
  <LabDetailEmptyState
    v-if="!isDockerReady"
    title="Docker 未就绪"
    message="本地 Docker 运行时不可用，容器日志功能暂时无法使用。"
  />
  <LabDetailEmptyState
    v-else-if="!selectedContainer"
    title="日志尚未绑定容器"
    message="选中目标容器后，可在这里检索输出、导出日志并追踪最近的运行记录。"
  />
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
