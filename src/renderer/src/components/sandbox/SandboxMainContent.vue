<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useUIStateStore, useSandboxStore } from '@renderer/stores'
import TerminalPanel from './TerminalPanel.vue'
import ContainerLogs from './ContainerLogs.vue'
import ContainerDetailPanel from './ContainerDetailPanel.vue'
import OrphanSandboxAlert from './OrphanSandboxAlert.vue'
import { TabNavigation } from './sandbox-detail'
import {
  useContainerLogs as useContainerLogsComposable,
  useContainerActions
} from './sandbox-detail'
import type { SandboxData } from '@shared/types/sandbox'

const STATS_AUTO_REFRESH_INTERVAL = 5000

// ==================== Props & Emits ====================

const props = defineProps<{
  currentSandbox: SandboxData | null
}>()

// ==================== Store ====================

const containerStore = useContainerStore()
const uiStateStore = useUIStateStore()
const sandboxStore = useSandboxStore()

const {
  selectedContainer,
  containerStats,
  terminalLogs,
  isLoading: storeLoading
} = storeToRefs(containerStore)

const { sandboxDetailTab } = storeToRefs(uiStateStore)

const statsRefreshTimerId = ref<number | null>(null)
const isRefreshingStats = ref(false)
const isManualRefreshingStats = ref(false)

// ==================== Computed ====================

const hasSandbox = computed(() => !!props.currentSandbox)

const isOrphan = computed(() => props.currentSandbox?.isOrphan || false)

// 用于 composables 的响应式引用
const currentSandboxRef = computed(() => props.currentSandbox)
const selectedContainerRef = computed(() => selectedContainer.value)

// ==================== Composables ====================

// 容器日志
const { containerLogs, logsLoading, loadContainerLogs, handleRefreshLogs, handleExportLogs } =
  useContainerLogsComposable(selectedContainerRef)

// 容器操作
const {
  handleContainerStart,
  handleContainerStop,
  handleContainerRestart,
  handleContainerRemove,
  handleExecuteCommand,
  handleClearTerminal
} = useContainerActions(currentSandboxRef, selectedContainerRef)

// ==================== Watch ====================

async function refreshStats(options?: { silent?: boolean }): Promise<void> {
  const containerId = selectedContainer.value?.id
  if (!containerId || isRefreshingStats.value) {
    return
  }

  isRefreshingStats.value = true
  try {
    await containerStore.loadContainerStats(containerId, options)
  } finally {
    isRefreshingStats.value = false
  }
}

function stopStatsAutoRefresh(): void {
  if (statsRefreshTimerId.value !== null) {
    clearInterval(statsRefreshTimerId.value)
    statsRefreshTimerId.value = null
  }
}

function startStatsAutoRefresh(): void {
  stopStatsAutoRefresh()

  if (sandboxDetailTab.value !== 'stats' || !selectedContainer.value) {
    return
  }

  statsRefreshTimerId.value = window.setInterval(() => {
    if (sandboxDetailTab.value !== 'stats' || !selectedContainer.value) {
      stopStatsAutoRefresh()
      return
    }

    void refreshStats({ silent: true })
  }, STATS_AUTO_REFRESH_INTERVAL)
}

async function syncStatsAutoRefresh(): Promise<void> {
  const container = selectedContainer.value
  if (sandboxDetailTab.value !== 'stats' || !container) {
    stopStatsAutoRefresh()
    return
  }

  if (container.state !== 'running') {
    stopStatsAutoRefresh()
    containerStore.clearContainerStats()
    return
  }

  await refreshStats()

  if (
    sandboxDetailTab.value === 'stats' &&
    selectedContainer.value?.id === container.id &&
    selectedContainer.value.state === 'running'
  ) {
    startStatsAutoRefresh()
  }
}

async function handleRefreshStats(): Promise<void> {
  if (isManualRefreshingStats.value) {
    return
  }

  isManualRefreshingStats.value = true
  try {
    await refreshStats()
  } finally {
    isManualRefreshingStats.value = false
  }
}

// Tab 切换时加载数据
watch(
  () => sandboxDetailTab.value,
  async (tab) => {
    if (tab === 'logs' && selectedContainer.value) {
      await loadContainerLogs()
    }

    await syncStatsAutoRefresh()
  },
  { immediate: true }
)

// 容器变化时重新加载数据
watch(
  () => selectedContainer.value?.id,
  async (newId, oldId) => {
    if (newId !== oldId) {
      containerStore.clearContainerStats()
    }

    if (newId) {
      if (sandboxDetailTab.value === 'logs') {
        await loadContainerLogs()
      }

      await syncStatsAutoRefresh()
      return
    }

    stopStatsAutoRefresh()
  }
)

watch(
  () => selectedContainer.value?.state,
  async () => {
    await syncStatsAutoRefresh()
  }
)

onBeforeUnmount(() => {
  stopStatsAutoRefresh()
})

// ==================== Methods ====================

function setDetailTab(tab: 'stats' | 'terminal' | 'logs'): void {
  uiStateStore.setSandboxDetailTab(tab)
}

async function handleOpenTerminal(): Promise<void> {
  setDetailTab('terminal')
}

async function handleViewLogs(): Promise<void> {
  setDetailTab('logs')
}

// ==================== 孤儿沙箱操作 ====================

async function handleRecoverOrphan(sandboxId: string): Promise<void> {
  // 暂时不传入新容器 ID，需要后续实现容器选择 UI
  await sandboxStore.recoverOrphanSandbox(sandboxId, '')
}

async function handleCleanupOrphan(sandboxId: string): Promise<void> {
  await sandboxStore.cleanupOrphanSandbox(sandboxId)
}

function handleCloseOrphanAlert(): void {
  window.api.logger.info('[SandboxMainContent] 用户关闭孤儿沙箱提示')
}
</script>

<template>
  <main class="sandbox-main-content">
    <!-- Tab 导航 -->
    <TabNavigation :visible="hasSandbox" />

    <!-- 内容区域 -->
    <div class="content-body">
      <!-- 空状态 -->
      <div v-if="!hasSandbox" class="empty-state">
        <div class="empty-content">
          <p class="empty-text">选择或创建一个沙箱开始</p>
          <p class="empty-hint">或点击「创建新沙箱」选择已有容器</p>
        </div>
      </div>

      <template v-else>
        <!-- 孤儿沙箱警告 -->
        <OrphanSandboxAlert
          :visible="isOrphan"
          :sandbox="currentSandbox"
          @recover="handleRecoverOrphan"
          @cleanup="handleCleanupOrphan"
          @close="handleCloseOrphanAlert"
        />

        <!-- 监控 Tab -->
        <div v-if="sandboxDetailTab === 'stats'" class="tab-content">
          <div v-if="!selectedContainer" class="empty-state">
            <div class="empty-content">
              <p class="empty-text">请先选择一个 Docker 容器</p>
              <p class="empty-hint">点击「创建新沙箱」选择已有容器</p>
            </div>
          </div>
          <ContainerDetailPanel
            v-else
            :container="selectedContainer"
            :stats="containerStats"
            :loading="storeLoading"
            :refreshing-stats="isManualRefreshingStats"
            :creation-type="currentSandbox?.creationType"
            :sandbox-name="currentSandbox?.name"
            @start="handleContainerStart"
            @stop="handleContainerStop"
            @restart="handleContainerRestart"
            @remove="handleContainerRemove"
            @open-terminal="handleOpenTerminal"
            @view-logs="handleViewLogs"
            @refresh-stats="handleRefreshStats"
          />
        </div>

        <!-- 终端 Tab -->
        <div v-else-if="sandboxDetailTab === 'terminal'" class="tab-content">
          <div v-if="!selectedContainer" class="empty-state">
            <div class="empty-content">
              <p class="empty-text">请先选择一个 Docker 容器</p>
              <p class="empty-hint">点击「创建新沙箱」选择已有容器</p>
            </div>
          </div>
          <TerminalPanel
            v-else
            :container-id="selectedContainer.id"
            :container-name="selectedContainer.names[0]?.replace(/^\//, '') || '未命名'"
            :logs="terminalLogs"
            :loading="storeLoading"
            @execute="handleExecuteCommand"
            @clear="handleClearTerminal"
          />
        </div>

        <!-- 日志 Tab -->
        <div v-else-if="sandboxDetailTab === 'logs'" class="tab-content">
          <div v-if="!selectedContainer" class="empty-state">
            <div class="empty-content">
              <p class="empty-text">请先选择一个 Docker 容器</p>
              <p class="empty-hint">点击「创建新沙箱」选择已有容器</p>
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
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped>
.sandbox-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--theme-bg);
  overflow: hidden;
}

/* 内容区域 */
.content-body {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.tab-content {
  height: 100%;
  overflow: hidden;
}

/* 空状态 */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--theme-text-secondary);
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 14px;
  margin: 0;
  opacity: 0.7;
}
</style>
