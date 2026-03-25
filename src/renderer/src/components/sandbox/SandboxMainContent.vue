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
import type { ContainerDetails, SandboxData } from '@shared/types/sandbox'

const SANDBOX_AUTO_REFRESH_INTERVAL = 3000

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

const sandboxRefreshTimerId = ref<number | null>(null)
const isRefreshingStats = ref(false)
const isManualRefreshingStats = ref(false)
const isRefreshingSandboxState = ref(false)
const isRetryingFrontend = ref(false)
const isRebuildingFrontend = ref(false)
const isValidatingFrontendBuild = ref(false)

// 容器生命周期操作加载状态
const isStartingContainer = ref(false)
const isStoppingContainer = ref(false)
const isRestartingContainer = ref(false)

// ==================== Computed ====================

const hasSandbox = computed(() => !!props.currentSandbox)

const isOrphan = computed(() => props.currentSandbox?.isOrphan || false)
const isFrontendSandbox = computed(() => !!props.currentSandbox?.frontend)
const showFrontendRecoveryBanner = computed(
  () => isFrontendSandbox.value && props.currentSandbox?.status === 'error' && !isOrphan.value
)
const frontendRecoveryMessage = computed(() => {
  const frontend = props.currentSandbox?.frontend
  if (!frontend) {
    return ''
  }

  if (frontend.bootstrapError) {
    return frontend.bootstrapError
  }

  return '前端服务尚未恢复，请重试初始化；如果运行容器已损坏，可直接重建。'
})
const orphanRecoverLabel = computed(() =>
  isFrontendSandbox.value ? '重建运行容器' : '重新关联容器'
)

// 用于 composables 的响应式引用
const currentSandboxRef = computed(() => props.currentSandbox)
const selectedContainerRef = computed(() => selectedContainer.value)

// ==================== Composables ====================

// 容器日志
const { containerLogs, logsLoading, loadContainerLogs, handleRefreshLogs, handleExportLogs } =
  useContainerLogsComposable(selectedContainerRef)

// 容器操作
const {
  handleContainerStart: _handleContainerStart,
  handleContainerStop: _handleContainerStop,
  handleContainerRestart: _handleContainerRestart,
  handleExecuteCommand,
  handleClearTerminal
} = useContainerActions(currentSandboxRef, selectedContainerRef)

// 包装容器操作函数，添加加载状态管理
async function handleContainerStart(): Promise<void> {
  isStartingContainer.value = true
  try {
    await _handleContainerStart()
  } finally {
    isStartingContainer.value = false
  }
}

async function handleContainerStop(): Promise<void> {
  isStoppingContainer.value = true
  try {
    await _handleContainerStop()
  } finally {
    isStoppingContainer.value = false
  }
}

async function handleContainerRestart(): Promise<void> {
  isRestartingContainer.value = true
  try {
    await _handleContainerRestart()
  } finally {
    isRestartingContainer.value = false
  }
}

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

function shouldKeepSandboxAutoRefresh(container?: ContainerDetails | null): boolean {
  const currentContainer = container || selectedContainer.value
  if (!props.currentSandbox || !currentContainer) {
    return false
  }

  if (props.currentSandbox.frontend && !isOrphan.value) {
    return true
  }

  return sandboxDetailTab.value === 'stats' && currentContainer.state === 'running'
}

async function validateFrontendBuildOnRefresh(): Promise<void> {
  const sandboxId = props.currentSandbox?.sandboxId
  const frontend = props.currentSandbox?.frontend

  if (
    !sandboxId ||
    !frontend ||
    isOrphan.value ||
    frontend.buildValidated ||
    props.currentSandbox?.status !== 'running' ||
    isValidatingFrontendBuild.value
  ) {
    return
  }

  isValidatingFrontendBuild.value = true
  try {
    await sandboxStore.validateFrontendBuild(sandboxId, {
      silent: true
    })
  } finally {
    isValidatingFrontendBuild.value = false
  }
}

async function runSandboxRefreshCycle(options?: { silentStats?: boolean }): Promise<void> {
  const sandboxId = props.currentSandbox?.sandboxId
  if (!sandboxId || isRefreshingSandboxState.value) {
    return
  }

  isRefreshingSandboxState.value = true
  try {
    await sandboxStore.loadSandbox(sandboxId, true, {
      silent: true
    })

    const container = selectedContainer.value
    if (!container) {
      containerStore.clearContainerStats()
      return
    }

    if (sandboxDetailTab.value === 'stats' && container.state === 'running') {
      await refreshStats({
        silent: options?.silentStats
      })
    } else if (container.state !== 'running') {
      containerStore.clearContainerStats()
    }

    await validateFrontendBuildOnRefresh()
  } finally {
    isRefreshingSandboxState.value = false
  }
}

function stopSandboxAutoRefresh(): void {
  if (sandboxRefreshTimerId.value !== null) {
    clearInterval(sandboxRefreshTimerId.value)
    sandboxRefreshTimerId.value = null
  }
}

function startSandboxAutoRefresh(): void {
  stopSandboxAutoRefresh()

  if (!shouldKeepSandboxAutoRefresh()) {
    return
  }

  sandboxRefreshTimerId.value = window.setInterval(() => {
    if (!shouldKeepSandboxAutoRefresh()) {
      stopSandboxAutoRefresh()
      return
    }

    void runSandboxRefreshCycle({ silentStats: true })
  }, SANDBOX_AUTO_REFRESH_INTERVAL)
}

async function syncSandboxAutoRefresh(): Promise<void> {
  const container = selectedContainer.value
  if (!container || !props.currentSandbox) {
    stopSandboxAutoRefresh()
    return
  }

  await runSandboxRefreshCycle()

  if (shouldKeepSandboxAutoRefresh(selectedContainer.value) && selectedContainer.value?.id === container.id) {
    startSandboxAutoRefresh()
  } else {
    stopSandboxAutoRefresh()
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

    await syncSandboxAutoRefresh()
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

      await syncSandboxAutoRefresh()
      return
    }

    stopSandboxAutoRefresh()
  }
)

watch(
  () => selectedContainer.value?.state,
  async () => {
    await syncSandboxAutoRefresh()
  }
)

watch(
  () => [
    props.currentSandbox?.sandboxId,
    props.currentSandbox?.status,
    props.currentSandbox?.frontend?.buildValidated
  ],
  async () => {
    await syncSandboxAutoRefresh()
  }
)

onBeforeUnmount(() => {
  stopSandboxAutoRefresh()
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

/**
 * 删除沙箱 - 弹出确认对话框
 */
function handleDeleteSandbox(): void {
  if (props.currentSandbox) {
    sandboxStore.handleDeleteSandbox(props.currentSandbox.sandboxId)
  }
}

// ==================== 孤儿沙箱操作 ====================

async function handleRecoverOrphan(): Promise<void> {
  if (props.currentSandbox?.frontend) {
    await handleRebuildFrontendRuntime()
    return
  }

  sandboxStore.showWarning(
    '暂不支持自动恢复',
    '当前只有前端沙箱支持基于持久化工作区自动重建容器。其他类型请手动恢复容器后重新关联。'
  )
}

async function handleCleanupOrphan(sandboxId: string): Promise<void> {
  await sandboxStore.handleDeleteSandbox(sandboxId)
}

async function handleRetryFrontendInitialization(): Promise<void> {
  const sandboxId = props.currentSandbox?.sandboxId
  if (!sandboxId || isRetryingFrontend.value) {
    return
  }

  isRetryingFrontend.value = true
  try {
    await sandboxStore.retryFrontendInitialization(sandboxId)
  } finally {
    isRetryingFrontend.value = false
  }
}

async function handleRebuildFrontendRuntime(): Promise<void> {
  const sandboxId = props.currentSandbox?.sandboxId
  if (!sandboxId || isRebuildingFrontend.value) {
    return
  }

  isRebuildingFrontend.value = true
  try {
    await sandboxStore.rebuildFrontendRuntime(sandboxId)
  } finally {
    isRebuildingFrontend.value = false
  }
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
          :is-reloading="isRebuildingFrontend"
          :can-recover="isFrontendSandbox"
          :recover-label="orphanRecoverLabel"
          @recover="handleRecoverOrphan"
          @cleanup="handleCleanupOrphan"
          @close="handleCloseOrphanAlert"
        />

        <div v-if="showFrontendRecoveryBanner" class="frontend-recovery-banner">
          <div class="frontend-recovery-copy">
            <h3>前端服务未就绪</h3>
            <p>{{ frontendRecoveryMessage }}</p>
          </div>
          <div class="frontend-recovery-actions">
            <button
              class="btn-secondary"
              :disabled="isRetryingFrontend || isRebuildingFrontend"
              @click="handleRetryFrontendInitialization"
            >
              {{ isRetryingFrontend ? '重试中...' : '重试初始化' }}
            </button>
            <button
              class="btn-primary"
              :disabled="isRetryingFrontend || isRebuildingFrontend"
              @click="handleRebuildFrontendRuntime"
            >
              {{ isRebuildingFrontend ? '重建中...' : '重建运行容器' }}
            </button>
          </div>
        </div>

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
            :starting-container="isStartingContainer"
            :stopping-container="isStoppingContainer"
            :restarting-container="isRestartingContainer"
            @start="handleContainerStart"
            @stop="handleContainerStop"
            @restart="handleContainerRestart"
            @remove="handleDeleteSandbox"
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
  position: relative;
}

.tab-content {
  height: 100%;
  overflow: hidden;
}

.frontend-recovery-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  margin: 12px;
  border: 1px solid rgba(210, 153, 34, 0.35);
  border-radius: 10px;
  background: rgba(210, 153, 34, 0.08);
}

.frontend-recovery-copy h3 {
  margin: 0 0 6px 0;
  font-size: 14px;
  color: var(--theme-text);
}

.frontend-recovery-copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--theme-text-secondary);
}

.frontend-recovery-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.btn-primary,
.btn-secondary {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-family: var(--theme-font);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  border: 1px solid rgba(70, 170, 143, 0.4);
  background: #46aa8f;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3d9980;
}

.btn-secondary {
  border: 1px solid var(--theme-border);
  background: var(--theme-bg-secondary);
  color: var(--theme-text);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--theme-text-secondary);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
