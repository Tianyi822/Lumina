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

const sandboxCreationTypeLabel = computed(() => {
  const labelMap: Record<SandboxData['creationType'], string> = {
    existing: '已有容器',
    compose: 'Docker Compose',
    dockerfile: 'Dockerfile'
  }

  return props.currentSandbox ? labelMap[props.currentSandbox.creationType] : ''
})

const sandboxStatusLabel = computed(() => {
  const labelMap: Record<SandboxData['status'], string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '异常'
  }

  return props.currentSandbox ? labelMap[props.currentSandbox.status] : ''
})

const sandboxStatusClass = computed(() => {
  return props.currentSandbox ? `status-${props.currentSandbox.status}` : ''
})

const sandboxContainerCount = computed(() => props.currentSandbox?.containerIds.length || 0)

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

function formatDateTime(value?: string): string {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <main class="sandbox-main-content">
    <div v-if="!hasSandbox" class="sandbox-empty-state">
      <div class="sm-empty sandbox-empty-card">
        <span class="sandbox-empty-card__eyebrow">工程控制台</span>
        <h2>选择一个沙箱开始</h2>
        <p>从左侧接管现有环境，或新建一个沙箱以进入容器监控、终端和日志工作流。</p>
      </div>
    </div>

    <template v-else>
      <header class="workspace-header">
        <div class="workspace-header__copy">
          <div class="workspace-header__headline">
            <div class="workspace-header__titles">
              <h1>{{ currentSandbox?.name }}</h1>
              <div class="workspace-header__badges">
                <span class="sm-badge">{{ sandboxCreationTypeLabel }}</span>
                <span class="sm-badge">{{ sandboxContainerCount }} 个容器</span>
                <span class="sm-badge" :class="sandboxStatusClass">{{ sandboxStatusLabel }}</span>
              </div>
            </div>
          </div>

          <div class="workspace-header__submeta">
            <span>
              沙箱 ID
              <code>{{ currentSandbox?.sandboxId }}</code>
            </span>
            <span>最近更新 {{ formatDateTime(currentSandbox?.updatedAt) }}</span>
          </div>
        </div>

        <TabNavigation :visible="hasSandbox" />
      </header>

      <div class="content-body">
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
            <span class="frontend-recovery-copy__eyebrow">恢复提示</span>
            <h3>前端服务未就绪</h3>
            <p>{{ frontendRecoveryMessage }}</p>
          </div>
          <div class="frontend-recovery-actions">
            <button
              class="sm-button sm-button--secondary"
              :disabled="isRetryingFrontend || isRebuildingFrontend"
              @click="handleRetryFrontendInitialization"
            >
              {{ isRetryingFrontend ? '重试中...' : '重试初始化' }}
            </button>
            <button
              class="sm-button sm-button--primary"
              :disabled="isRetryingFrontend || isRebuildingFrontend"
              @click="handleRebuildFrontendRuntime"
            >
              {{ isRebuildingFrontend ? '重建中...' : '重建运行容器' }}
            </button>
          </div>
        </div>

        <!-- 监控 Tab -->
        <div v-if="sandboxDetailTab === 'stats'" class="tab-content">
          <div v-if="!selectedContainer" class="detail-empty-state">
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
          <div v-if="!selectedContainer" class="detail-empty-state">
            <div class="sm-empty detail-empty-card">
              <h2>终端尚未绑定容器</h2>
              <p>选中目标容器后，可在这里执行临时命令、定位问题并确认运行环境。</p>
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
          <div v-if="!selectedContainer" class="detail-empty-state">
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
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.sandbox-main-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sandbox-empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sm-space-6);
}

.sandbox-empty-card {
  width: min(520px, 100%);
  background: var(--sm-color-surface-2);
  border-style: solid;
}

.sandbox-empty-card__eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.sandbox-empty-card h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.sandbox-empty-card p {
  margin: 0;
  max-width: 420px;
  line-height: 1.6;
}

.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-5);
  padding: var(--sm-space-6);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.workspace-header__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.workspace-header__headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.workspace-header__titles {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  flex: 1;
  min-width: 0;
}

.workspace-header__titles h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  color: var(--sm-color-text-primary);
}

.workspace-header__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  justify-content: flex-start;
}

.workspace-header__submeta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-4);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.workspace-header__submeta code {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: 999px;
  background: var(--sm-color-bg-embedded);
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
  font-size: 11px;
}

.workspace-header__badges .status-running {
  border-color: rgba(127, 176, 138, 0.28);
  background: rgba(127, 176, 138, 0.08);
  color: #7fb08a;
}

.workspace-header__badges .status-creating {
  border-color: rgba(142, 149, 217, 0.28);
  background: rgba(142, 149, 217, 0.08);
  color: var(--sm-color-accent-hover);
}

.workspace-header__badges .status-stopped {
  border-color: var(--sm-color-border-default);
  background: rgba(255, 255, 255, 0.04);
  color: var(--sm-color-text-secondary);
}

.workspace-header__badges .status-error {
  border-color: rgba(199, 120, 120, 0.28);
  background: rgba(199, 120, 120, 0.08);
  color: #c77878;
}

.content-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  overflow: hidden;
  padding: 0 var(--sm-space-6) var(--sm-space-6);
  position: relative;
}

.tab-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.frontend-recovery-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-4);
  border: 1px solid rgba(210, 153, 34, 0.35);
  border-radius: var(--sm-radius-md);
  background: rgba(210, 153, 34, 0.08);
}

.frontend-recovery-copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.frontend-recovery-copy__eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #c5a165;
}

.frontend-recovery-copy h3 {
  margin: 0;
  font-size: 14px;
  color: var(--sm-color-text-primary);
}

.frontend-recovery-copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.frontend-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  flex-shrink: 0;
}

.detail-empty-state {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.detail-empty-card {
  width: min(460px, 100%);
  background: var(--sm-color-surface-2);
  border-style: solid;
}

.detail-empty-card h2 {
  margin: 0;
  font-size: 17px;
  color: var(--sm-color-text-primary);
}

.detail-empty-card p {
  margin: 0;
  max-width: 380px;
  line-height: 1.6;
}

@media (max-width: 920px) {
  .workspace-header,
  .workspace-header__headline,
  .frontend-recovery-banner {
    flex-direction: column;
  }
}

@media (max-width: 720px) {
  .workspace-header {
    padding: var(--sm-space-5);
  }

  .content-body {
    padding: 0 var(--sm-space-5) var(--sm-space-5);
  }
}
</style>
