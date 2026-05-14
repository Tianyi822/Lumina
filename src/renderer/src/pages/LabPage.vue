<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLabStore, useUIStateStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import LabMainContent from '@renderer/components/lab/LabMainContent.vue'
import LabCreator from '@renderer/components/lab/LabCreator.vue'
import ConfigManager from '@renderer/components/lab/ConfigManager.vue'
import DeleteConfirmDialog from '@renderer/components/lab/DeleteConfirmDialog.vue'
import type { PlatformType, DockerCheckResult } from '@renderer/types/lab'

const DOCKER_WEBSITE = 'https://www.docker.com/products/docker-desktop/'

const labStore = useLabStore()
const uiStateStore = useUIStateStore()
const notify = useNotification()

const { currentLab, currentLabId, deleteConfirmState } = storeToRefs(labStore)

const { showLabCreator, showConfigManager } = storeToRefs(uiStateStore)

const dockerStatus = ref<DockerCheckResult | null>(null)
const platform = ref<PlatformType>('darwin')
const loading = ref(true)
const dockerRecheckTimerId = ref<ReturnType<typeof setInterval> | null>(null)

const DOCKER_RECHECK_INTERVAL = 15000

// ==================== Docker 检测 ====================

const checkDocker = async (): Promise<void> => {
  try {
    loading.value = true
    const [statusResult, platformResult] = await Promise.all([
      labApi.checkDocker(),
      labApi.getPlatform()
    ])
    dockerStatus.value = statusResult
    platform.value = platformResult

    if (!statusResult.installed && statusResult.error && statusResult.error !== 'Docker 未安装') {
      notify.error('Docker 检测失败', statusResult.error, {
        source: 'lab',
        dedupeKey: 'lab:checkDocker'
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    dockerStatus.value = { installed: false, error: errorMessage }
    notify.error('Docker 检测失败', errorMessage, {
      source: 'lab',
      dedupeKey: 'lab:checkDocker'
    })
  } finally {
    loading.value = false
  }
}

// 静默重检 Docker 状态（不显示 loading、不弹错误通知，仅更新状态）
const checkDockerSilent = async (): Promise<void> => {
  try {
    const result = await labApi.checkDocker()
    dockerStatus.value = result
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

const openDockerWebsite = async (): Promise<void> => {
  const result = await labApi.openExternal(DOCKER_WEBSITE)
  if (!result.success) {
    notify.error('打开 Docker 官网失败', result.error || '未知错误', { source: 'lab' })
  }
}

const handleCloseCreator = (): void => {
  uiStateStore.closeLabCreator()
}

const handleCloseConfigManager = (): void => {
  uiStateStore.closeConfigManager()
}

// ==================== 持久化选中实验室 ====================

watch(currentLabId, (id) => {
  uiStateStore.setLastLabId(id ?? null)
})

// ==================== 生命周期 ====================

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
      <!-- Docker 未就绪时显示轻量警告条 -->
      <div v-if="!dockerStatus?.installed" class="sm-lab-docker-warning">
        <div class="sm-lab-docker-warning__copy">
          <span class="sm-lab-docker-warning__icon">&#9888;</span>
          <span class="sm-lab-docker-warning__text">
            未检测到本地 Docker 运行时，Docker 类型实验室功能受限。 SSH 远程实验室不受影响。
          </span>
        </div>
        <div class="sm-lab-docker-warning__actions">
          <button class="sm-button sm-button--primary sm-button--small" @click="openDockerWebsite">
            安装 Docker
          </button>
          <button class="sm-button sm-button--secondary sm-button--small" @click="checkDocker">
            重新检测
          </button>
        </div>
      </div>

      <LabMainContent :current-lab="currentLab" :docker-status="dockerStatus" />

      <!-- 创建实验室弹窗 -->
      <LabCreator
        :visible="showLabCreator"
        :docker-status="dockerStatus"
        @close="handleCloseCreator"
      />

      <!-- 配置管理弹窗 -->
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

/* Docker 未就绪警告条 */
.sm-lab-docker-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: 10px var(--sm-space-4);
  border-bottom: 1px solid var(--sm-color-border-default);
  background: linear-gradient(
    135deg,
    var(--sm-color-accent-06, rgba(213, 161, 74, 0.06)),
    var(--sm-color-accent-04, rgba(213, 161, 74, 0.04))
  );
}

.sm-lab-docker-warning__copy {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
}

.sm-lab-docker-warning__icon {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--sm-color-warning, #d5a14a);
}

.sm-lab-docker-warning__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.sm-lab-docker-warning__actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .sm-lab-docker-warning {
    flex-direction: column;
    align-items: flex-start;
  }

  .sm-lab-docker-warning__actions {
    align-self: stretch;
  }

  .sm-lab-docker-warning__actions .sm-button {
    flex: 1;
  }
}
</style>
