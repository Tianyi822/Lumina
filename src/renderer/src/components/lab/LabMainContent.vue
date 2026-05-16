<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useUIStateStore, useLabStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import OrphanLabAlert from './OrphanLabAlert.vue'
import SshReconnectPrompt from './SshReconnectPrompt.vue'
import { TabNavigation } from './lab-detail'
import { useContainerActions } from './lab-detail'
import LabStatsTab from './LabStatsTab.vue'
import LabTerminalTab from './LabTerminalTab.vue'
import LabLogsTab from './LabLogsTab.vue'
import { useLabAutoRefresh } from './useLabAutoRefresh'
import type { LabData, DockerStatus } from '@renderer/types/lab'

const DOCKER_WEBSITE = 'https://www.docker.com/products/docker-desktop/'

const props = defineProps<{
  currentLab: LabData | null
  dockerStatus?: DockerStatus | null
  recheckingDocker?: boolean
}>()

const emit = defineEmits<{
  recheckDocker: []
}>()

// Store 实例
const containerStore = useContainerStore()
const uiStateStore = useUIStateStore()
const labStore = useLabStore()
const notify = useNotification()

const { selectedContainer, containerStats, isLoading: storeLoading } = storeToRefs(containerStore)
const { labDetailTab } = storeToRefs(uiStateStore)

// 计算属性
const hasLab = computed(() => !!props.currentLab)
const isOrphan = computed(() => props.currentLab?.isOrphan || false)
const isLabFrontend = computed(() => !!props.currentLab?.frontend)
const isSshLab = computed(() => props.currentLab?.backendType === 'ssh')
const isDockerLab = computed(() => hasLab.value && !isSshLab.value)
const isDockerReady = computed(() => props.dockerStatus?.available ?? false)
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
const sshAuthLabel = computed(() => {
  const authType = props.currentLab?.ssh?.authType
  if (!authType) {
    return ''
  }

  return authType === 'password' ? '密码认证' : '密钥认证'
})
const isSshConnected = computed(() => props.currentLab?.status === 'running')

const currentLabRef = computed(() => props.currentLab)
const selectedContainerRef = computed(() => selectedContainer.value)

// 自动刷新组合逻辑
const autoRefresh = useLabAutoRefresh({
  currentLab: currentLabRef,
  selectedContainer: selectedContainerRef,
  labDetailTab,
  isSshLab,
  isOrphan,
  isLabFrontend
})

// 容器操作
const {
  handleContainerStart: _handleContainerStart,
  handleContainerStop: _handleContainerStop,
  handleContainerRestart: _handleContainerRestart
} = useContainerActions(currentLabRef, selectedContainerRef)

const isStartingContainer = ref(false)
const isStoppingContainer = ref(false)
const isRestartingContainer = ref(false)

async function handleContainerStart(): Promise<void> {
  if (!isDockerReady.value) return
  isStartingContainer.value = true
  try {
    await _handleContainerStart()
  } finally {
    isStartingContainer.value = false
  }
}

async function handleContainerStop(): Promise<void> {
  if (!isDockerReady.value) return
  isStoppingContainer.value = true
  try {
    await _handleContainerStop()
  } finally {
    isStoppingContainer.value = false
  }
}

async function handleContainerRestart(): Promise<void> {
  if (!isDockerReady.value) return
  isRestartingContainer.value = true
  try {
    await _handleContainerRestart()
  } finally {
    isRestartingContainer.value = false
  }
}

// SSH 操作
const isConnectingSsh = ref(false)
const sshReconnectPassword = ref('')

async function handleSshConnect(): Promise<void> {
  const labId = props.currentLab?.labId
  const ssh = props.currentLab?.ssh
  if (!labId || !ssh) return

  if (ssh.authType === 'password' && !sshReconnectPassword.value.trim()) {
    notify.warning('请输入 SSH 密码', '密码认证的连接需要重新输入密码后再连接', { source: 'lab' })
    return
  }

  isConnectingSsh.value = true
  try {
    const connected = await labStore.connectSsh(labId, {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      authType: ssh.authType,
      password: ssh.authType === 'password' ? sshReconnectPassword.value : undefined,
      keyName: ssh.keyName
    })

    if (connected) {
      sshReconnectPassword.value = ''
      await labStore.loadLab(labId, true)
    }
  } finally {
    isConnectingSsh.value = false
  }
}

// 前端恢复
const isRetryingFrontend = ref(false)
const isRebuildingFrontend = ref(false)

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

// 其他处理函数
function setDetailTab(tab: 'stats' | 'terminal' | 'logs'): void {
  uiStateStore.setLabDetailTab(tab)
}

function handleDeleteLab(): void {
  if (props.currentLab) {
    labStore.handleDeleteLab(props.currentLab.labId)
  }
}

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

async function handleOpenDockerWebsite(): Promise<void> {
  const result = await labApi.openExternal(DOCKER_WEBSITE)
  if (!result.success) {
    notify.warning('打开 Docker 官网失败', result.error || '未知错误', { source: 'lab' })
  }
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

// 监听器
watch(
  () => [isSshLab.value, labDetailTab.value] as const,
  ([sshLab, tab]) => {
    if (sshLab && tab === 'logs') {
      setDetailTab('stats')
    }
  },
  { immediate: true }
)

watch(
  () => props.currentLab?.labId,
  () => {
    sshReconnectPassword.value = ''
  }
)

// 生命周期
let removeSshStatusListener: (() => void) | null = null

onMounted(() => {
  removeSshStatusListener = window.api.ssh.onConnectionStatus((event) => {
    if (event.labId === props.currentLab?.labId) {
      void labStore.loadLab(event.labId, true, { silent: true })
    }
  })
})

onBeforeUnmount(() => {
  autoRefresh.cleanup()
  removeSshStatusListener?.()
  removeSshStatusListener = null
})
</script>

<template>
  <main class="lab-main-content">
    <div v-if="!hasLab" class="lab-empty-state">
      <div class="sm-empty lab-empty-card">
        <h2>选择一个实验室开始</h2>
        <p>从左侧接管现有环境，或创建一个实验室以进入容器监控、终端和日志工作流。</p>
        <p v-if="!isDockerReady" class="lab-empty-card__ssh-hint">
          本地 Docker 未就绪？您仍然可以
          <strong>创建 SSH 远程服务器</strong> 类型的实验室来连接远程主机。
        </p>
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
                <span v-if="isSshLab && sshAuthLabel" class="sm-badge">{{ sshAuthLabel }}</span>
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

        <div class="workspace-header__actions">
          <SshReconnectPrompt
            v-if="isSshLab && currentLab && !isSshConnected"
            v-model:password="sshReconnectPassword"
            :lab="currentLab"
            :connecting="isConnectingSsh"
            @connect="handleSshConnect"
          />
          <button
            v-if="isDockerLab && !isDockerReady"
            class="sm-button sm-button--small sm-button--secondary docker-recheck-btn"
            :disabled="recheckingDocker"
            @click="emit('recheckDocker')"
          >
            {{ recheckingDocker ? '检测中...' : '重新检测 Docker' }}
          </button>
          <TabNavigation :visible="hasLab" :show-logs="!isSshLab" />
        </div>
      </header>

      <div class="content-body">
        <!-- Docker 未就绪时对 Docker 类型实验室显示警告 -->
        <div v-if="isDockerLab && !isDockerReady" class="docker-unready-banner">
          <span class="docker-unready-banner__icon">&#9888;</span>
          <div class="docker-unready-banner__text">
            <strong>本地 Docker 未就绪</strong>
            <p v-if="dockerStatus?.installed === false">
              Docker 未安装。请先
              <a class="docker-unready-banner__link" @click="handleOpenDockerWebsite"
                >安装 Docker</a
              >
              ，然后点击上方"重新检测 Docker"按钮。SSH 远程实验室不受影响。
            </p>
            <p v-else>
              容器操作、终端和日志功能暂不可用。请启动 Docker 服务后点击上方"重新检测
              Docker"按钮。SSH 远程实验室不受影响。
            </p>
          </div>
        </div>

        <OrphanLabAlert
          :visible="isOrphan"
          :lab="currentLab"
          :is-reloading="isRebuildingFrontend"
          :can-recover="isLabFrontend"
          :recover-label="orphanRecoverLabel"
          @recover="handleRecoverOrphan"
          @cleanup="handleCleanupOrphan"
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
        <div v-show="labDetailTab === 'stats'" class="tab-content">
          <LabStatsTab
            :is-ssh-lab="isSshLab"
            :is-docker-ready="isDockerReady"
            :is-stats-tab-active="labDetailTab === 'stats'"
            :current-lab="currentLab"
            :selected-container="selectedContainer"
            :container-stats="containerStats"
            :store-loading="storeLoading"
            :is-manual-refreshing-stats="autoRefresh.isManualRefreshingStats.value"
            :starting-container="isStartingContainer"
            :stopping-container="isStoppingContainer"
            :restarting-container="isRestartingContainer"
            :creation-type="currentLab?.creationType"
            :lab-name="currentLab?.name"
            @start="handleContainerStart"
            @stop="handleContainerStop"
            @restart="handleContainerRestart"
            @remove="handleDeleteLab"
            @open-terminal="setDetailTab('terminal')"
            @view-logs="setDetailTab('logs')"
            @refresh-stats="autoRefresh.handleRefreshStats()"
          />
        </div>

        <!-- 终端 Tab -->
        <div v-show="labDetailTab === 'terminal'" class="tab-content">
          <LabTerminalTab
            :is-ssh-lab="isSshLab"
            :is-docker-ready="isDockerReady"
            :current-lab="currentLab"
            :selected-container="selectedContainer"
            :is-ssh-connected="isSshConnected"
            :lab-detail-tab="labDetailTab"
          />
        </div>

        <!-- 日志 Tab -->
        <div v-if="!isSshLab" v-show="labDetailTab === 'logs'" class="tab-content">
          <LabLogsTab :is-docker-ready="isDockerReady" />
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

.lab-empty-card__ssh-hint {
  margin-top: var(--sm-space-3) !important;
  padding-top: var(--sm-space-3);
  border-top: 1px solid var(--sm-color-border-subtle);
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.lab-empty-card__ssh-hint strong {
  color: var(--sm-color-text-secondary);
}

/* Docker 未就绪横幅 */
.docker-unready-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--sm-space-3);
  padding: var(--sm-space-3) var(--sm-space-4);
  border: 1px solid rgba(213, 161, 74, 0.25);
  border-radius: var(--sm-radius-md);
  background: rgba(213, 161, 74, 0.06);
}

.docker-unready-banner__icon {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1.4;
  color: var(--sm-color-warning, #d5a14a);
}

.docker-unready-banner__text {
  min-width: 0;
}

.docker-unready-banner__text strong {
  display: block;
  margin-bottom: var(--sm-space-1);
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.docker-unready-banner__text p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.docker-unready-banner__link {
  color: var(--sm-color-accent-hover);
  cursor: pointer;
  text-decoration: underline;
}

.docker-unready-banner__link:hover {
  color: var(--sm-color-accent);
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

.workspace-header__actions {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--sm-space-3);
  flex-wrap: wrap;
  flex-shrink: 0;
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

@media (max-width: 920px) {
  .workspace-header,
  .workspace-header__headline,
  .frontend-recovery-banner,
  .workspace-header__actions {
    flex-direction: column;
  }

  .workspace-header__actions {
    align-items: stretch;
    width: 100%;
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

.docker-recheck-btn {
  min-height: 46px;
  padding: 0 14px;
  font-size: 13px;
}
</style>
