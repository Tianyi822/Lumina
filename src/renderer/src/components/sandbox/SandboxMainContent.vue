<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useUIStateStore, useSandboxStore } from '@renderer/stores'
import TerminalPanel from './TerminalPanel.vue'
import ContainerLogs from './ContainerLogs.vue'
import ContainerDetailPanel from './ContainerDetailPanel.vue'
import OrphanSandboxAlert from './OrphanSandboxAlert.vue'
import type {
  SandboxData,
  SandboxLogEntry,
  SandboxStatus
} from '@shared/types/sandbox'

// ==================== Props & Emits ====================

const props = defineProps<{
  currentSandbox: SandboxData | null
  operationLogs: SandboxLogEntry[]
}>()

const emit = defineEmits<{
  (e: 'rename', sandboxId: string, newName: string): void
}>()

// ==================== Store ====================

const containerStore = useContainerStore()
const uiStateStore = useUIStateStore()

const {
  selectedContainer,
  containerStats,
  terminalLogs,
  isLoading: storeLoading
} = storeToRefs(containerStore)

const { sandboxDetailTab } = storeToRefs(uiStateStore)

// ==================== State ====================

const isEditing = ref(false)
const editingName = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)
const containerLogs = ref('')
const logsLoading = ref(false)

const hasSandbox = computed(() => !!props.currentSandbox)

// 创建类型标签
const creationTypeLabel = computed(() => {
  if (!props.currentSandbox?.creationType) return '未知'
  const labels: Record<string, string> = {
    existing: '已有容器',
    compose: 'Compose',
    dockerfile: 'Dockerfile'
  }
  return labels[props.currentSandbox.creationType] || props.currentSandbox.creationType
})

// 是否为孤儿沙箱
const isOrphan = computed(() => {
  return props.currentSandbox?.isOrphan || false
})

// ==================== Watch ====================

watch(
  () => props.currentSandbox?.name,
  () => {
    if (props.currentSandbox && !isEditing.value) {
      editingName.value = props.currentSandbox.name
    }
  },
  { immediate: true }
)

watch(
  () => sandboxDetailTab.value,
  async (tab) => {
    if (tab === 'logs' && selectedContainer.value) {
      await loadContainerLogs()
    } else if (tab === 'stats' && selectedContainer.value) {
      await containerStore.loadContainerStats(selectedContainer.value.id)
    }
  }
)

watch(
  () => selectedContainer.value?.id,
  async (newId) => {
    if (newId && sandboxDetailTab.value === 'logs') {
      await loadContainerLogs()
    }
  }
)

// ==================== Methods ====================

function getStatusLabel(status: SandboxStatus): string {
  const labels: Record<SandboxStatus, string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '错误'
  }
  return labels[status] || status
}

function getStatusClass(status: SandboxStatus): string {
  return `status-${status}`
}

// 将容器状态映射到沙箱状态
function mapContainerStateToStatus(state: string | undefined): SandboxStatus {
  if (!state) return 'stopped'
  switch (state) {
    case 'running':
      return 'running'
    case 'created':
    case 'paused':
    case 'restarting':
      return 'running'
    case 'exited':
    case 'dead':
    case 'removing':
      return 'stopped'
    default:
      return 'stopped'
  }
}

// 获取实际显示的状态（优先使用容器实时状态）
function getDisplayStatus(): SandboxStatus {
  if (selectedContainer.value?.state) {
    return mapContainerStateToStatus(selectedContainer.value.state)
  }
  return props.currentSandbox?.status || 'stopped'
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatLogTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getLogLevelClass(level: string): string {
  return `log-level-${level}`
}

function startEditing(): void {
  if (!props.currentSandbox) return
  editingName.value = props.currentSandbox.name
  isEditing.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function saveName(): void {
  if (!props.currentSandbox) return
  const trimmedName = editingName.value.trim()
  if (trimmedName && trimmedName !== props.currentSandbox.name) {
    emit('rename', props.currentSandbox.sandboxId, trimmedName)
  }
  isEditing.value = false
}

function cancelEditing(): void {
  if (props.currentSandbox) {
    editingName.value = props.currentSandbox.name
  }
  isEditing.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelEditing()
  } else if (event.key === 'Enter') {
    saveName()
  }
}

function handleBlur(): void {
  saveName()
}

// ==================== Tab 切换 ====================

function setDetailTab(tab: 'info' | 'terminal' | 'logs' | 'stats'): void {
  uiStateStore.setSandboxDetailTab(tab)
}

// ==================== 容器操作 ====================

async function handleContainerStart(): Promise<void> {
  if (selectedContainer.value) {
    await containerStore.startContainer(selectedContainer.value.id)
  }
}

async function handleContainerStop(): Promise<void> {
  if (selectedContainer.value) {
    await containerStore.stopContainer(selectedContainer.value.id)
  }
}

async function handleContainerRestart(): Promise<void> {
  if (selectedContainer.value) {
    await containerStore.restartContainer(selectedContainer.value.id)
  }
}

async function handleContainerRemove(): Promise<void> {
  if (selectedContainer.value) {
    await containerStore.removeContainer(selectedContainer.value.id)
  }
}

async function handleOpenTerminal(): Promise<void> {
  setDetailTab('terminal')
}

async function handleViewLogs(): Promise<void> {
  setDetailTab('logs')
}

async function handleRefreshStats(): Promise<void> {
  if (selectedContainer.value) {
    await containerStore.loadContainerStats(selectedContainer.value.id)
  }
}

async function loadContainerLogs(): Promise<void> {
  if (!selectedContainer.value) return
  logsLoading.value = true
  try {
    containerLogs.value = await containerStore.getContainerLogs(selectedContainer.value.id, {
      tail: 500
    })
  } finally {
    logsLoading.value = false
  }
}

async function handleRefreshLogs(): Promise<void> {
  await loadContainerLogs()
}

function handleExportLogs(): void {
  const blob = new Blob([containerLogs.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const containerName = selectedContainer.value?.names[0]?.replace(/^\//, '') || 'container'
  a.download = `${containerName}-logs.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ==================== 终端操作 ====================

async function handleExecuteCommand(command: string): Promise<void> {
  if (!selectedContainer.value) return
  await containerStore.execCommand(selectedContainer.value.id, { command })
}

function handleClearTerminal(): void {
  containerStore.clearTerminalLogs()
}

// ==================== 孤儿沙箱操作 ====================

async function handleRecoverOrphan(sandboxId: string): Promise<void> {
  // 调用 sandboxStore 的恢复方法
  // TODO: 需要用户选择新容器来关联
  const { useSandboxStore } = await import('@renderer/stores')
  const sandboxStore = useSandboxStore()
  // 暂时不传入新容器 ID，需要后续实现容器选择 UI
  await sandboxStore.recoverOrphanSandbox(sandboxId, '')
}

async function handleCleanupOrphan(sandboxId: string): Promise<void> {
  // 调用 sandboxStore 的清理方法
  const { useSandboxStore } = await import('@renderer/stores')
  const sandboxStore = useSandboxStore()
  await sandboxStore.cleanupOrphanSandbox(sandboxId)
}

// 刷新沙箱状态
async function handleRefreshStatus(): Promise<void> {
  if (!props.currentSandbox) return

  const sandboxStore = useSandboxStore()

  // 刷新容器列表
  await containerStore.loadContainers()

  // 重新加载当前容器的详情
  const containerId = props.currentSandbox.primaryContainerId || props.currentSandbox.containerIds?.[0]
  if (containerId) {
    await containerStore.loadContainerDetails(containerId)
  }

  // 同时刷新沙箱列表以保持同步
  await sandboxStore.refreshSandboxList()
}

function handleCloseOrphanAlert(): void {
  // 用户关闭警告，暂时忽略
  console.log('用户关闭了孤儿沙箱警告')
}
</script>

<template>
  <main class="sandbox-main-content">
    <!-- Tab 导航 -->
    <div v-if="hasSandbox" class="detail-tabs">
      <button
        class="tab-btn"
        :class="{ active: sandboxDetailTab === 'info' }"
        @click="setDetailTab('info')"
      >
        基本信息
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
      <button
        class="tab-btn"
        :class="{ active: sandboxDetailTab === 'stats' }"
        @click="setDetailTab('stats')"
      >
        监控
      </button>
    </div>

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
        <!-- 基本信息 Tab -->
        <div v-if="sandboxDetailTab === 'info'" class="tab-content">
          <div class="sandbox-detail">
            <div class="info-section">
              <h3 class="section-title">基本信息</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">名称</span>
                  <div v-if="isEditing" class="info-value-edit">
                    <input
                      ref="nameInputRef"
                      v-model="editingName"
                      class="name-input"
                      @keydown="handleKeydown"
                      @blur="handleBlur"
                    />
                  </div>
                  <div v-else class="info-value-wrapper">
                    <span class="info-value">{{ currentSandbox?.name }}</span>
                    <button class="btn-edit-inline" title="编辑" @click="startEditing">
                      <svg viewBox="0 0 1024 1024" width="14" height="14">
                        <path
                          d="M864.909927 823.227521a31.261805 31.261805 0 0 1 4.251605 62.231832l-4.251605 0.291777h-333.459249a31.261805 31.261805 0 0 1-4.251605-62.231832l4.251605-0.291777h333.459249z"
                          fill="currentColor"
                        />
                        <path
                          d="M835.469757 155.90459a166.729624 166.729624 0 0 1 0 235.791296l-450.92138 450.92138a83.364812 83.364812 0 0 1-49.751963 23.932817l-184.35932 20.484368a41.682406 41.682406 0 0 1-46.067724-46.067724l20.513842-184.388794a83.364812 83.364812 0 0 1 23.903343-49.781437L599.648987 155.934064a166.729624 166.729624 0 0 1 235.791296 0z m-44.210868 44.210868a104.206015 104.206015 0 0 0-142.358995-4.656878l-5.010565 4.656878-450.92138 450.92138a20.841203 20.841203 0 0 0-5.27583 8.989543l-0.6779 3.448448-17.625399 158.510699 158.510698-17.6254a20.841203 20.841203 0 0 0 9.755865-3.684239l2.682126-2.269491L791.258889 347.485018a104.206015 104.206015 0 0 0 0-147.36956z"
                          fill="currentColor"
                        />
                        <path
                          d="M547.638023 279.397574a31.261805 31.261805 0 0 1 40.998211-47.010889l3.212657 2.800021 176.843472 176.843472a31.261805 31.261805 0 0 1-41.027686 46.981416l-3.183182-2.770548-176.843472-176.843472z"
                          fill="currentColor"
                        />
                        <path
                          d="M864.909927 698.180302a31.261805 31.261805 0 0 1 4.251605 62.231833l-4.251605 0.291777h-166.729625a31.261805 31.261805 0 0 1-4.251605-62.231833l4.251605-0.291777h166.729625z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="info-item">
                  <span class="info-label">状态</span>
                  <div class="info-value-wrapper">
                    <span
                      class="info-value status-badge"
                      :class="getStatusClass(getDisplayStatus())"
                    >
                      {{ getStatusLabel(getDisplayStatus()) }}
                    </span>
                    <button
                      class="btn-refresh-status"
                      title="刷新状态"
                      @click.stop="handleRefreshStatus"
                    >
                      <svg viewBox="0 0 1024 1024" width="14" height="14">
                        <path
                          d="M896 198.4 896 198.4l0 179.2 0 0c0 19.2-6.4 32-19.2 44.8-12.8 12.8-32 19.2-44.8 19.2l0 0-179.2 0 0 0c-19.2 0-32-6.4-44.8-19.2-25.6-25.6-25.6-64 0-89.6C620.8 320 633.6 313.6 652.8 313.6l0 0 25.6 0C627.2 275.2 576 256 518.4 256 441.6 256 377.6 281.6 332.8 332.8l0 0c-25.6 25.6-64 25.6-89.6 0-25.6-25.6-25.6-64 0-89.6l0 0C313.6 172.8 409.6 128 518.4 128c96 0 185.6 38.4 249.6 96L768 198.4l0 0c0-19.2 6.4-32 19.2-44.8 25.6-25.6 64-25.6 89.6 0C889.6 160 896 179.2 896 198.4zM416 691.2c-12.8 12.8-32 19.2-44.8 19.2l0 0L352 710.4C396.8 748.8 448 768 505.6 768c70.4 0 134.4-25.6 179.2-76.8l0 0c25.6-25.6 64-25.6 89.6 0 25.6 25.6 25.6 64 0 89.6l0 0C710.4 851.2 614.4 896 505.6 896c-96 0-185.6-38.4-249.6-96l0 32 0 0c0 19.2-6.4 32-19.2 44.8-25.6 25.6-64 25.6-89.6 0C134.4 864 128 844.8 128 825.6l0 0 0-179.2 0 0c0-19.2 6.4-32 19.2-44.8C160 588.8 172.8 582.4 192 582.4l0 0 179.2 0 0 0c19.2 0 32 6.4 44.8 19.2C441.6 627.2 441.6 665.6 416 691.2z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="info-item">
                  <span class="info-label">创建类型</span>
                  <span class="info-value">{{ creationTypeLabel }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">创建时间</span>
                  <span class="info-value">{{
                    formatDateTime(currentSandbox?.createdAt || '')
                  }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">更新时间</span>
                  <span class="info-value">{{
                    formatDateTime(currentSandbox?.updatedAt || '')
                  }}</span>
                </div>
                <div v-if="currentSandbox?.description" class="info-item full-width">
                  <span class="info-label">描述</span>
                  <span class="info-value">{{ currentSandbox.description }}</span>
                </div>
              </div>
            </div>

            <div class="log-section">
              <h3 class="section-title">操作日志</h3>
              <div class="log-container">
                <div v-if="operationLogs.length === 0" class="empty-log">暂无操作日志</div>
                <div v-else class="log-list">
                  <div
                    v-for="(log, index) in operationLogs"
                    :key="index"
                    class="log-entry"
                    :class="getLogLevelClass(log.level)"
                  >
                    <span class="log-time">[{{ formatLogTime(log.timestamp) }}]</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

        <!-- 监控 Tab -->
        <div v-else-if="sandboxDetailTab === 'stats'" class="tab-content">
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
            :is-existing-container="currentSandbox?.creationType === 'existing'"
            @start="handleContainerStart"
            @stop="handleContainerStop"
            @restart="handleContainerRestart"
            @remove="handleContainerRemove"
            @open-terminal="handleOpenTerminal"
            @view-logs="handleViewLogs"
            @refresh-stats="handleRefreshStats"
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

/* Tab 导航 */
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

/* 沙箱详情 */
.sandbox-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.info-section {
  margin-bottom: 32px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 14px;
  color: var(--theme-text-secondary);
}

.info-value {
  font-size: 15px;
  color: var(--theme-text);
  line-height: 22px;
}

.info-value-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-refresh-status {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--theme-accent);
  transition: opacity 0.2s, background-color 0.2s, color 0.2s;
}

.btn-refresh-status svg {
  display: block;
}

.btn-refresh-status:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
}

.info-value-edit {
  display: flex;
  align-items: center;
}

.name-input {
  padding: 4px 8px;
  font-size: 15px;
  font-family: var(--theme-font);
  color: var(--theme-text);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-accent);
  border-radius: 4px;
  outline: none;
  width: 100%;
  max-width: 250px;
}

.btn-edit-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-edit-inline:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-creating {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.status-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.status-stopped {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--theme-text-secondary);
}

.status-error {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.log-section {
  margin-bottom: 24px;
}

.log-container {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 12px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.empty-log {
  color: var(--theme-text-secondary);
  font-size: 13px;
  text-align: center;
  padding: 24px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  font-size: 13px;
  font-family: var(--theme-font);
  line-height: 1.5;
}

.log-time {
  color: var(--theme-text-secondary);
  margin-right: 8px;
}

.log-message {
  color: var(--theme-text);
}

.log-level-info .log-message {
  color: var(--theme-text);
}

.log-level-warn .log-message {
  color: var(--theme-warning);
}

.log-level-error .log-message {
  color: var(--theme-danger);
}
</style>
