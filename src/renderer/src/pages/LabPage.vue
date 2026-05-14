<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useLabStore, useUIStateStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import LabMainContent from '@renderer/components/lab/LabMainContent.vue'
import LabCreator from '@renderer/components/lab/LabCreator.vue'
import ConfigManager from '@renderer/components/lab/ConfigManager.vue'
import DeleteConfirmDialog from '@renderer/components/lab/DeleteConfirmDialog.vue'
import type { DockerStatus } from '@renderer/types/lab'

const DOCKER_WEBSITE = 'https://www.docker.com/products/docker-desktop/'
const DOCKER_RECHECK_INTERVAL = 15000

const labStore = useLabStore()
const uiStateStore = useUIStateStore()
const notify = useNotification()

const { currentLab, currentLabId, deleteConfirmState } = storeToRefs(labStore)
const { showLabCreator, showConfigManager } = storeToRefs(uiStateStore)

const dockerStatus = ref<DockerStatus | null>(null)
const loading = ref(true)
const dockerNotifyId = ref<string | null>(null)
const dockerRecheckTimerId = ref<ReturnType<typeof setInterval> | null>(null)

function buildDockerNotifyActions(
  status: DockerStatus
): Array<{ label: string; handler: () => void; primary?: boolean }> {
  const actions: Array<{ label: string; handler: () => void; primary?: boolean }> = []

  actions.push({
    label: '重新检测',
    primary: true,
    handler: async () => {
      await checkDocker()
      if (dockerStatus.value?.available && dockerNotifyId.value) {
        notify.dismiss(dockerNotifyId.value)
        dockerNotifyId.value = null
      }
    }
  })

  if (!status.installed) {
    actions.push({
      label: '前往 Docker 官网',
      handler: async () => {
        const result = await labApi.openExternal(DOCKER_WEBSITE)
        if (!result.success) {
          notify.error('打开 Docker 官网失败', result.error || '未知错误', { source: 'lab' })
        }
      }
    })
  }

  return actions
}

function showDockerUnavailableNotify(status: DockerStatus): void {
  if (dockerNotifyId.value) {
    return
  }

  const title = status.installed ? 'Docker 未启动' : 'Docker 未安装'
  const message = status.installed
    ? '请启动 Docker Desktop 后点击重新检测'
    : '实验室工作区依赖本机 Docker 运行时，请安装后重新检测'

  const id = notify.warning(title, message, {
    source: 'lab',
    sticky: true,
    dedupeKey: `docker:${status.installed ? 'stopped' : 'missing'}`,
    actions: buildDockerNotifyActions(status)
  })

  if (id) {
    dockerNotifyId.value = id
  }
}

async function checkDocker(): Promise<void> {
  if (loading.value) return

  try {
    loading.value = true
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
    loading.value = false
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
  <div class="sm-lab-page sm-workspace-view">
    <div
      v-if="loading"
      class="sm-lab-page__loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="sm-spinner sm-spinner--large sm-lab-page__loading-spinner"></div>
      <p>正在检测 Docker...</p>
    </div>

    <template v-else>
      <LabMainContent :current-lab="currentLab" :docker-status="dockerStatus" />

      <LabCreator
        :visible="showLabCreator"
        :docker-status="dockerStatus"
        @close="handleCloseCreator"
      />

      <ConfigManager :visible="showConfigManager" @close="handleCloseConfigManager" />

      <DeleteConfirmDialog
        :visible="deleteConfirmState.show"
        :is-deleting="deleteConfirmState.isDeleting"
        :lab="
          deleteConfirmState.labId
            ? {
                labId: deleteConfirmState.labId,
                name: deleteConfirmState.labName,
                creationType: deleteConfirmState.creationType || 'existing',
                containerIds: Array.from(
                  { length: deleteConfirmState.containerCount },
                  (_, index) => String(index)
                ),
                hasWorkspace: deleteConfirmState.hasWorkspace,
                workspaceName: deleteConfirmState.workspaceName
              }
            : null
        "
        @close="labStore.hideDeleteConfirm()"
        @confirm="(_labId, options) => labStore.confirmDelete(options)"
      />
    </template>
  </div>
</template>

<style scoped>
.sm-lab-page {
  display: flex;
  flex-direction: column;
}

.sm-lab-page__loading {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 16px;
  color: var(--sm-color-text-secondary);
}

.sm-lab-page__loading-spinner {
  color: var(--sm-color-accent-hover);
}
</style>
