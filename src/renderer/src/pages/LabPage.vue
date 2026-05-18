<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useLabStore, useUIStateStore } from '@renderer/stores'
import styles from './LabPage.module.css'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import LabMainContent from '@renderer/components/lab/LabMainContent.vue'
import LabCreator from '@renderer/components/lab/LabCreator.vue'
import ConfigManager from '@renderer/components/lab/ConfigManager.vue'
import DeleteConfirmDialog from '@renderer/components/lab/DeleteConfirmDialog.vue'
import type { DockerStatus, LabCreationType } from '@renderer/types/lab'

const DOCKER_RECHECK_INTERVAL = 15000

const labStore = useLabStore()
const uiStateStore = useZustandStore(useUIStateStore)
const notify = useNotification()

const { currentLab, currentLabId, deleteConfirmState } = storeToRefs(labStore)

const dockerStatus = ref<DockerStatus | null>(null)
const loading = ref(true)
const dockerNotifyId = ref<string | null>(null)
const dockerRecheckTimerId = ref<ReturnType<typeof setInterval> | null>(null)
const recheckingDocker = ref(false)

function isManagedDockerLab(type: LabCreationType): boolean {
  return type === 'compose' || type === 'dockerfile'
}

const deleteDialogLab = computed(() => {
  const state = deleteConfirmState.value
  if (!state.labId) {
    return null
  }

  const creationType = state.creationType || 'existing'
  const metadataOnlyDelete =
    isManagedDockerLab(creationType) && (dockerStatus.value?.available === false || state.isOrphan)

  return {
    labId: state.labId,
    name: state.labName,
    creationType,
    containerIds: Array.from({ length: state.containerCount }, (_, index) => String(index)),
    hasWorkspace: state.hasWorkspace,
    workspaceName: state.workspaceName,
    metadataOnlyDelete
  }
})

function showDockerUnavailableNotify(status: DockerStatus): void {
  if (dockerNotifyId.value) {
    return
  }

  const title = status.installed ? 'Docker 未启动' : 'Docker 未安装'
  const message = status.installed
    ? '请启动 Docker 服务，然后点击页面中的"重新检测 Docker"按钮。SSH 远程实验室不受影响。'
    : '实验室工作区依赖本机 Docker 运行时，请安装后点击页面中的"重新检测 Docker"按钮。SSH 远程实验室不受影响。'

  const id = notify.warning(title, message, {
    source: 'lab',
    sticky: true,
    dedupeKey: `docker:${status.installed ? 'stopped' : 'missing'}`
  })

  if (id) {
    dockerNotifyId.value = id
  }
}

async function checkDocker(showFullLoading = true): Promise<void> {
  if (!showFullLoading && recheckingDocker.value) return

  try {
    if (showFullLoading) {
      loading.value = true
    } else {
      recheckingDocker.value = true
    }

    const statusResult = await labApi.checkDocker()
    dockerStatus.value = statusResult

    if (!statusResult.available) {
      showDockerUnavailableNotify(statusResult)
    } else {
      if (dockerNotifyId.value) {
        notify.dismiss(dockerNotifyId.value)
        dockerNotifyId.value = null
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    dockerStatus.value = { available: false, installed: false, error: errorMessage }
    notify.error('Docker 检测失败', errorMessage, {
      source: 'lab',
      dedupeKey: 'lab:checkDocker'
    })
  } finally {
    if (showFullLoading) {
      loading.value = false
    } else {
      recheckingDocker.value = false
    }
  }
}

// 静默重检 Docker 状态（不显示 loading、不弹错误通知）
const checkDockerSilent = async (): Promise<void> => {
  try {
    const result = await labApi.checkDocker()
    dockerStatus.value = result

    // Docker 恢复可用时关闭通知
    if (result.available && dockerNotifyId.value) {
      notify.dismiss(dockerNotifyId.value)
      dockerNotifyId.value = null
    }
  } catch {
    // 静默失败，保留上次已知状态
  }
}

const startDockerRecheck = (): void => {
  stopDockerRecheck()
  dockerRecheckTimerId.value = setInterval(() => {
    void checkDockerSilent()
  }, DOCKER_RECHECK_INTERVAL)
}

const stopDockerRecheck = (): void => {
  if (dockerRecheckTimerId.value !== null) {
    clearInterval(dockerRecheckTimerId.value)
    dockerRecheckTimerId.value = null
  }
}

function handleCloseCreator(): void {
  uiStateStore.closeLabCreator()
}

function handleCloseConfigManager(): void {
  uiStateStore.closeConfigManager()
}

function handleRecheckDocker(): void {
  void checkDocker(false)
}

watch(currentLabId, (id) => {
  uiStateStore.setLastLabId(id ?? null)
})

onMounted(async () => {
  await checkDocker()

  // 始终加载实验室列表（SSH 实验室不依赖 Docker）
  await labStore.loadLabList()

  if (!currentLab.value && uiStateStore.lastLabId) {
    await labStore.loadLab(uiStateStore.lastLabId, false, { silent: true })
  }

  // 启动定时重检（检测 Docker 在应用运行期间被关闭/启动的情况）
  startDockerRecheck()
})

onBeforeUnmount(() => {
  stopDockerRecheck()
  if (dockerNotifyId.value) {
    notify.dismiss(dockerNotifyId.value)
    dockerNotifyId.value = null
  }
})
</script>

<template>
  <div :class="[styles.page, 'sm-workspace-view']">
    <div v-if="loading" :class="styles.loading" role="status" aria-live="polite" aria-busy="true">
      <div :class="['sm-spinner', 'sm-spinner--large', styles.loadingSpinner]"></div>
      <p>正在检测 Docker...</p>
    </div>

    <template v-else>
      <LabMainContent
        :current-lab="currentLab"
        :docker-status="dockerStatus"
        :rechecking-docker="recheckingDocker"
        @recheck-docker="handleRecheckDocker"
      />

      <LabCreator
        :visible="uiStateStore.showLabCreator"
        :docker-status="dockerStatus"
        @close="handleCloseCreator"
      />

      <ConfigManager :visible="uiStateStore.showConfigManager" @close="handleCloseConfigManager" />

      <DeleteConfirmDialog
        :visible="deleteConfirmState.show"
        :is-deleting="deleteConfirmState.isDeleting"
        :lab="deleteDialogLab"
        @close="labStore.hideDeleteConfirm()"
        @confirm="(_labId, options) => labStore.confirmDelete(options)"
      />
    </template>
  </div>
</template>
