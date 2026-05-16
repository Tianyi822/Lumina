<script setup lang="ts">
import ContainerDetailPanel from './ContainerDetailPanel.vue'
import SshServerMonitorPanel from './SshServerMonitorPanel.vue'
import type { ContainerDetails, ContainerStats, LabData } from '@renderer/types/lab'

defineProps<{
  isSshLab: boolean
  isDockerReady: boolean
  isStatsTabActive: boolean
  currentLab: LabData | null
  selectedContainer: ContainerDetails | null
  containerStats: ContainerStats | null
  storeLoading: boolean
  isManualRefreshingStats: boolean
  startingContainer: boolean
  stoppingContainer: boolean
  restartingContainer: boolean
  creationType?: LabData['creationType']
  labName?: string
}>()

defineEmits<{
  start: []
  stop: []
  restart: []
  remove: []
  'open-terminal': []
  'view-logs': []
  'refresh-stats': []
}>()
</script>

<template>
  <template v-if="isSshLab">
    <SshServerMonitorPanel
      v-if="currentLab"
      :lab-id="currentLab.labId"
      :connected="currentLab.status === 'running'"
      :active="isStatsTabActive"
    />
  </template>
  <template v-else>
    <div v-if="!isDockerReady" class="detail-empty-state">
      <div class="sm-empty detail-empty-card">
        <h2>Docker 未就绪</h2>
        <p>本地 Docker 运行时不可用，容器监控功能暂时无法使用。</p>
      </div>
    </div>
    <div v-else-if="!selectedContainer" class="detail-empty-state">
      <div class="sm-empty detail-empty-card">
        <h2>请先选择一个容器</h2>
        <p>选中主容器后，这里会显示运行指标、端口映射和环境细节。</p>
      </div>
    </div>
    <ContainerDetailPanel
      v-else
      :container="selectedContainer"
      :stats="containerStats"
      :loading="storeLoading"
      :refreshing-stats="isManualRefreshingStats"
      :creation-type="creationType"
      :lab-name="labName"
      :starting-container="startingContainer"
      :stopping-container="stoppingContainer"
      :restarting-container="restartingContainer"
      @start="$emit('start')"
      @stop="$emit('stop')"
      @restart="$emit('restart')"
      @remove="$emit('remove')"
      @open-terminal="$emit('open-terminal')"
      @view-logs="$emit('view-logs')"
      @refresh-stats="$emit('refresh-stats')"
    />
  </template>
</template>
