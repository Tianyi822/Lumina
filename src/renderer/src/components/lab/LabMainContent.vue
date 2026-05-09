<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useUIStateStore, useLabStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import TerminalPanel from './TerminalPanel.vue'
import ContainerLogs from './ContainerLogs.vue'
import ContainerDetailPanel from './ContainerDetailPanel.vue'
import OrphanLabAlert from './OrphanLabAlert.vue'
import { TabNavigation } from './lab-detail'
import { useContainerLogs as useContainerLogsComposable, useContainerActions } from './lab-detail'
import type { ContainerDetails, LabData } from '@renderer/types/lab'

const LAB_AUTO_REFRESH_INTERVAL = 3000

// ==================== Props & Emits ====================

const props = defineProps<{
  currentLab: LabData | null
}>()

// ==================== Store ====================

const containerStore = useContainerStore()
const uiStateStore = useUIStateStore()
const labStore = useLabStore()
const notify = useNotification()

const {
  selectedContainer,
  containerStats,
  terminalLogs,
  isLoading: storeLoading
} = storeToRefs(containerStore)

const { labDetailTab } = storeToRefs(uiStateStore)

const labRefreshTimerId = ref<number | null>(null)
const isRefreshingStats = ref(false)
const isManualRefreshingStats = ref(false)
const isRefreshingLabState = ref(false)
const isRetryingFrontend = ref(false)
const isRebuildingFrontend = ref(false)
const isValidatingFrontendBuild = ref(false)

// 容器生命周期操作加载状态
const isStartingContainer = ref(false)
const isStoppingContainer = ref(false)
const isRestartingContainer = ref(false)

// ==================== Computed ====================

const hasLab = computed(() => !!props.currentLab)

const isOrphan = computed(() => props.currentLab?.isOrphan || false)
const isLabFrontend = computed(() => !!props.currentLab?.frontend)
const isSshLab = computed(() => props.currentLab?.backendType === 'ssh')
const showFrontendRecoveryBanner = computed(
  () => isLabFrontend.value && props.currentLab?.status === 'error' && !isOrphan.value
)
const frontendRecoveryMessage = computed(() => {
  const frontend = props.currentLab?.frontend
  if (!frontend) {
    return ''
  }

  if (frontend.bootstrapError) {
    return frontend.bootstrapError
  }

  return '前端服务尚未恢复，请重试初始化；如果运行容器已损坏，可直接重建。'
})
const orphanRecoverLabel = computed(() => (isLabFrontend.value ? '重建运行容器' : '重新关联容器'))

const labCreationTypeLabel = computed(() => {
  const labelMap: Record<LabData['creationType'], string> = {
    existing: '已有容器',
    compose: 'Docker Compose',
    dockerfile: 'Dockerfile',
    ssh: 'SSH 远程服务器'
  }

  return props.currentLab ? labelMap[props.currentLab.creationType] : ''
})

const labStatusLabel = computed(() => {
  if (!props.currentLab) return ''

  if (props.currentLab.backendType === 'ssh') {
    const sshLabelMap: Record<LabData['status'], string> = {
      creating: '连接中',
      running: '已连接',
      stopped: '未连接',
      error: '连接失败'
    }
    return sshLabelMap[props.currentLab.status]
  }

  const labelMap: Record<LabData['status'], string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '异常'
  }
  return labelMap[props.currentLab.status]
})

const labStatusClass = computed(() => {
  return props.currentLab ? `status-${props.currentLab.status}` : ''
})

const labContainerCount = computed(() => props.currentLab?.containerIds.length || 0)

// 用于 composables 的响应式引用
const currentLabRef = computed(() => props.currentLab)
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
} = useContainerActions(currentLabRef, selectedContainerRef)

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

function shouldKeepLabAutoRefresh(container?: ContainerDetails | null): boolean {
  const currentContainer = container || selectedContainer.value
  if (!props.currentLab || !currentContainer) {
    return false
  }

  if (props.currentLab.frontend && !isOrphan.value) {
    return true
  }

  return labDetailTab.value === 'stats' && currentContainer.state === 'running'
}

async function validateFrontendBuildOnRefresh(): Promise<void> {
  const labId = props.currentLab?.labId
  const frontend = props.currentLab?.frontend

  if (
    !labId ||
    !frontend ||
    isOrphan.value ||
    frontend.buildValidated ||
    props.currentLab?.status !== 'running' ||
    isValidatingFrontendBuild.value
  ) {
    return
  }

  isValidatingFrontendBuild.value = true
  try {
    await labStore.validateFrontendBuild(labId, {
      silent: true
    })
  } finally {
    isValidatingFrontendBuild.value = false
  }
}

async function runLabRefreshCycle(options?: { silentStats?: boolean }): Promise<void> {
  const labId = props.currentLab?.labId
  if (!labId || isRefreshingLabState.value) {
    return
  }

  isRefreshingLabState.value = true
  try {
    await labStore.loadLab(labId, true, {
      silent: true
    })

    const container = selectedContainer.value
    if (!container) {
      containerStore.clearContainerStats()
      return
    }

    if (labDetailTab.value === 'stats' && container.state === 'running') {
      await refreshStats({
        silent: options?.silentStats
      })
    } else if (container.state !== 'running') {
      containerStore.clearContainerStats()
    }

    await validateFrontendBuildOnRefresh()
  } finally {
    isRefreshingLabState.value = false
  }
}

function stopLabAutoRefresh(): void {
  if (labRefreshTimerId.value !== null) {
    clearInterval(labRefreshTimerId.value)
    labRefreshTimerId.value = null
  }
}

function startLabAutoRefresh(): void {
  stopLabAutoRefresh()

  if (!shouldKeepLabAutoRefresh()) {
    return
  }

  labRefreshTimerId.value = window.setInterval(() => {
    if (!shouldKeepLabAutoRefresh()) {
      stopLabAutoRefresh()
      return
    }

    void runLabRefreshCycle({ silentStats: true })
  }, LAB_AUTO_REFRESH_INTERVAL)
}

async function syncLabAutoRefresh(): Promise<void> {
  const container = selectedContainer.value
  if (!container || !props.currentLab) {
    stopLabAutoRefresh()
    return
  }

  await runLabRefreshCycle()

  if (
    shouldKeepLabAutoRefresh(selectedContainer.value) &&
    selectedContainer.value?.id === container.id
  ) {
    startLabAutoRefresh()
  } else {
    stopLabAutoRefresh()
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
  () => labDetailTab.value,
  async (tab) => {
    if (tab === 'logs' && selectedContainer.value) {
      await loadContainerLogs()
    }

    await syncLabAutoRefresh()
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
      if (labDetailTab.value === 'logs') {
        await loadContainerLogs()
      }

      await syncLabAutoRefresh()
      return
    }

    stopLabAutoRefresh()
  }
)

watch(
  () => selectedContainer.value?.state,
  async () => {
    await syncLabAutoRefresh()
  }
)

watch(
  () => [
    props.currentLab?.labId,
    props.currentLab?.status,
    props.currentLab?.frontend?.buildValidated
  ],
  async () => {
    await syncLabAutoRefresh()
  }
)

onBeforeUnmount(() => {
  stopLabAutoRefresh()
})

// ==================== Methods ====================

function setDetailTab(tab: 'stats' | 'terminal' | 'logs'): void {
  uiStateStore.setLabDetailTab(tab)
}

async function handleOpenTerminal(): Promise<void> {
  setDetailTab('terminal')
}

async function handleViewLogs(): Promise<void> {
  setDetailTab('logs')
}

/**
 * 删除实验室 - 弹出确认对话框
 */
function handleDeleteLab(): void {
  if (props.currentLab) {
    labStore.handleDeleteLab(props.currentLab.labId)
  }
}

// ==================== 孤儿实验室操作 ====================

async function handleRecoverOrphan(): Promise<void> {
  if (props.currentLab?.frontend) {
    await handleRebuildFrontendRuntime()
    return
  }

  notify.warning(
    '暂不支持自动恢复',
    '当前只有前端实验室支持基于持久化工作区自动重建容器。其他类型请手动恢复容器后重新关联。',
    { source: 'lab' }
  )
}

async function handleCleanupOrphan(labId: string): Promise<void> {
  await labStore.handleDeleteLab(labId)
}

async function handleRetryFrontendInitialization(): Promise<void> {
  const labId = props.currentLab?.labId
  if (!labId || isRetryingFrontend.value) {
    return
  }

  isRetryingFrontend.value = true
  try {
    await labStore.retryFrontendInitialization(labId)
  } finally {
    isRetryingFrontend.value = false
  }
}

async function handleRebuildFrontendRuntime(): Promise<void> {
  const labId = props.currentLab?.labId
  if (!labId || isRebuildingFrontend.value) {
    return
  }

  isRebuildingFrontend.value = true
  try {
    await labStore.rebuildFrontendRuntime(labId)
  } finally {
    isRebuildingFrontend.value = false
  }
}

function handleCloseOrphanAlert(): void {
  window.api.logger.info('[LabMainContent] 用户关闭孤儿实验室提示')
}

const isConnectingSsh = ref(false)

/** 密码认证的 SSH 实验室断开后无法自动重连（密码未持久化） */
const canReconnectSsh = computed(() => {
  if (!props.currentLab?.ssh) return false
  return props.currentLab.ssh.authType !== 'password'
})

async function handleSshConnect(): Promise<void> {
  const labId = props.currentLab?.labId
  const ssh = props.currentLab?.ssh
  if (!labId || !ssh) return

  isConnectingSsh.value = true
  try {
    const connected = await labStore.connectSsh(labId, {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      authType: ssh.authType,
      keyName: ssh.keyName
    })

    if (connected) {
      await labStore.loadLab(labId, true)
    }
  } finally {
    isConnectingSsh.value = false
  }
}

async function handleSshDisconnect(): Promise<void> {
  const labId = props.currentLab?.labId
  if (!labId) return

  await labStore.disconnectSsh(labId)
  await labStore.loadLab(labId, true)
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
  <main class="lab-main-content">
    <div v-if="!hasLab" class="lab-empty-state">
      <div class="sm-empty lab-empty-card">
        <h2>选择一个实验室开始</h2>
        <p>从左侧接管现有环境，或创建一个实验室以进入容器监控、终端和日志工作流。</p>
      </div>
    </div>

    <template v-else>
      <header class="workspace-header">
        <div class="workspace-header__copy">
          <div class="workspace-header__headline">
            <div class="workspace-header__titles">
              <h1>{{ currentLab?.name }}</h1>
              <div class="workspace-header__badges">
                <span class="sm-badge">{{ labCreationTypeLabel }}</span>
                <span v-if="!isSshLab" class="sm-badge">{{ labContainerCount }} 个容器</span>
                <span class="sm-badge" :class="labStatusClass">{{ labStatusLabel }}</span>
              </div>
            </div>
          </div>

          <div class="workspace-header__submeta">
            <span>
              实验室 ID
              <code>{{ currentLab?.labId }}</code>
            </span>
            <span>最近更新 {{ formatDateTime(currentLab?.updatedAt) }}</span>
          </div>
        </div>

        <TabNavigation :visible="hasLab" />
      </header>

      <div class="content-body">
        <OrphanLabAlert
          :visible="isOrphan"
          :lab="currentLab"
          :is-reloading="isRebuildingFrontend"
          :can-recover="isLabFrontend"
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
        <div v-if="labDetailTab === 'stats'" class="tab-content">
          <!-- SSH 连接信息面板 -->
          <template v-if="isSshLab">
            <section class="ssh-info-panel">
              <div class="ssh-info-panel__header">
                <h3>连接信息</h3>
                <div class="ssh-info-panel__actions">
                  <template v-if="currentLab?.status !== 'running'">
                    <button
                      v-if="canReconnectSsh"
                      class="sm-button sm-button--primary"
                      :disabled="isConnectingSsh"
                      @click="handleSshConnect"
                    >
                      {{ isConnectingSsh ? '连接中...' : '连接' }}
                    </button>
                    <span v-else class="ssh-info-panel__hint">
                      密码认证的连接需重新创建实验室以恢复
                    </span>
                  </template>
                  <button
                    v-else
                    class="sm-button sm-button--secondary"
                    @click="handleSshDisconnect"
                  >
                    断开连接
                  </button>
                </div>
              </div>

              <div v-if="currentLab?.ssh" class="ssh-info-panel__grid">
                <div class="ssh-info-panel__item">
                  <span class="ssh-info-panel__label">主机</span>
                  <span class="ssh-info-panel__value">
                    {{ currentLab.ssh.host }}:{{ currentLab.ssh.port }}
                  </span>
                </div>
                <div class="ssh-info-panel__item">
                  <span class="ssh-info-panel__label">用户</span>
                  <span class="ssh-info-panel__value">{{ currentLab.ssh.username }}</span>
                </div>
                <div class="ssh-info-panel__item">
                  <span class="ssh-info-panel__label">认证方式</span>
                  <span class="ssh-info-panel__value">
                    {{ currentLab.ssh.authType === 'password' ? '密码' : '密钥' }}
                  </span>
                </div>
                <div class="ssh-info-panel__item">
                  <span class="ssh-info-panel__label">连接状态</span>
                  <span class="ssh-info-panel__value" :class="{ connected: currentLab.status === 'running' }">
                    {{ labStatusLabel }}
                  </span>
                </div>
              </div>
            </section>
          </template>

          <template v-else>
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
            :creation-type="currentLab?.creationType"
            :lab-name="currentLab?.name"
            :starting-container="isStartingContainer"
            :stopping-container="isStoppingContainer"
            :restarting-container="isRestartingContainer"
            @start="handleContainerStart"
            @stop="handleContainerStop"
            @restart="handleContainerRestart"
            @remove="handleDeleteLab"
            @open-terminal="handleOpenTerminal"
            @view-logs="handleViewLogs"
            @refresh-stats="handleRefreshStats"
          />
          </template>
        </div>

        <!-- 终端 Tab -->
        <div v-else-if="labDetailTab === 'terminal'" class="tab-content">
          <div v-if="isSshLab" class="ssh-terminal-hint">
            <p>通过 SSH 在远程服务器执行命令。终端将直接使用实验室的 SSH 连接。</p>
          </div>
          <template v-else>
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
          </template>
        </div>

        <!-- 日志 Tab -->
        <div v-else-if="labDetailTab === 'logs'" class="tab-content">
          <template v-if="isSshLab">
            <div class="detail-empty-state">
              <div class="sm-empty detail-empty-card">
                <h2>SSH 实验室暂不支持日志查看</h2>
                <p>SSH 远程服务器的日志功能将在后续版本中支持。</p>
              </div>
            </div>
          </template>
          <template v-else>
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
          </template>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.lab-main-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lab-empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sm-space-6);
}

.lab-empty-card {
  width: min(520px, 100%);
  background: var(--sm-color-surface-2);
  border-style: solid;
}
.lab-empty-card h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.lab-empty-card p {
  margin: 0;
  max-width: 420px;
  line-height: 1.6;
}

.workspace-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sm-space-5);
  padding: var(--sm-space-6);
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
  font-size: 28px;
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
  border-color: var(--sm-color-accent-28);
  background: var(--sm-color-accent-08);
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

.ssh-info-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.ssh-info-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ssh-info-panel__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.ssh-info-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sm-space-3);
}

.ssh-info-panel__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
}

.ssh-info-panel__label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.ssh-info-panel__value {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
}

.ssh-info-panel__value.connected {
  color: #7fb08a;
}

.ssh-info-panel__hint {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  font-style: italic;
}

.ssh-terminal-hint {
  padding: var(--sm-space-5);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.ssh-terminal-hint p {
  margin: 0;
  color: var(--sm-color-text-secondary);
  font-size: 14px;
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
