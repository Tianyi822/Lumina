<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useZustandStore } from '@renderer/composables/useZustandStore'
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
import styles from './LabMainContent.module.css'

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
const uiStateStore = useZustandStore(useUIStateStore)
const labStore = useLabStore()
const notify = useNotification()

const { selectedContainer, containerStats, isLoading: storeLoading } = storeToRefs(containerStore)
const labDetailTab = computed(() => uiStateStore.labDetailTab)

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
  <main :class="styles['lab-main-content']">
    <div v-if="!hasLab" :class="styles['lab-empty-state']">
      <div :class="['sm-empty', styles['lab-empty-card']]">
        <h2>选择一个实验室开始</h2>
        <p>从左侧接管现有环境，或创建一个实验室以进入容器监控、终端和日志工作流。</p>
        <p v-if="!isDockerReady" :class="styles['lab-empty-card__ssh-hint']">
          本地 Docker 未就绪？您仍然可以
          <strong>创建 SSH 远程服务器</strong> 类型的实验室来连接远程主机。
        </p>
      </div>
    </div>

    <template v-else>
      <header :class="styles['workspace-header']">
        <div :class="styles['workspace-header__copy']">
          <div :class="styles['workspace-header__headline']">
            <div :class="styles['workspace-header__titles']">
              <h1>{{ currentLab?.name }}</h1>
              <div :class="styles['workspace-header__badges']">
                <span class="sm-badge">{{ labCreationTypeLabel }}</span>
                <span v-if="!isSshLab" class="sm-badge">{{ labContainerCount }} 个容器</span>
                <span v-if="isSshLab && sshAuthLabel" class="sm-badge">{{ sshAuthLabel }}</span>
                <span class="sm-badge" :class="styles[labStatusClass]">{{ labStatusLabel }}</span>
              </div>
            </div>
          </div>

          <div :class="styles['workspace-header__submeta']">
            <span>
              实验室 ID
              <code>{{ currentLab?.labId }}</code>
            </span>
            <span>最近更新 {{ formatDateTime(currentLab?.updatedAt) }}</span>
          </div>
        </div>

        <div :class="styles['workspace-header__actions']">
          <SshReconnectPrompt
            v-if="isSshLab && currentLab && !isSshConnected"
            v-model:password="sshReconnectPassword"
            :lab="currentLab"
            :connecting="isConnectingSsh"
            @connect="handleSshConnect"
          />
          <button
            v-if="isDockerLab && !isDockerReady"
            :class="[styles['docker-recheck-btn']]"
            :disabled="recheckingDocker"
            @click="emit('recheckDocker')"
          >
            {{ recheckingDocker ? '检测中...' : '重新检测 Docker' }}
          </button>
          <TabNavigation :visible="hasLab" :show-logs="!isSshLab" />
        </div>
      </header>

      <div :class="styles['content-body']">
        <!-- Docker 未就绪时对 Docker 类型实验室显示警告 -->
        <div v-if="isDockerLab && !isDockerReady" :class="styles['docker-unready-banner']">
          <span :class="styles['docker-unready-banner__icon']">&#9888;</span>
          <div :class="styles['docker-unready-banner__text']">
            <strong>本地 Docker 未就绪</strong>
            <p v-if="dockerStatus?.installed === false">
              Docker 未安装。请先
              <a :class="styles['docker-unready-banner__link']" @click="handleOpenDockerWebsite"
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

        <div v-if="showFrontendRecoveryBanner" :class="styles['frontend-recovery-banner']">
          <div :class="styles['frontend-recovery-copy']">
            <span :class="styles['frontend-recovery-copy__eyebrow']">恢复提示</span>
            <h3>前端服务未就绪</h3>
            <p>{{ frontendRecoveryMessage }}</p>
          </div>
          <div :class="styles['frontend-recovery-actions']">
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
        <div v-show="labDetailTab === 'stats'" :class="styles['tab-content']">
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
        <div v-show="labDetailTab === 'terminal'" :class="styles['tab-content']">
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
        <div v-if="!isSshLab" v-show="labDetailTab === 'logs'" :class="styles['tab-content']">
          <LabLogsTab :is-docker-ready="isDockerReady" />
        </div>
      </div>
    </template>
  </main>
</template>
