import { useState, useEffect, useCallback, useRef } from 'react'
import { useLabStore, useLabListStore, useLabOperationStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { labApi } from '@renderer/services/labApi'
import LabMainContent from '@renderer/components/lab/LabMainContent'
import LabCreator from '@renderer/components/lab/LabCreator'
import ConfigManager from '@renderer/components/lab/ConfigManager'
import DeleteConfirmDialog from '@renderer/components/lab/DeleteConfirmDialog'
import type { DockerStatus, LabCreationType } from '@renderer/types/lab'
import styles from './LabPage.module.css'

const DOCKER_RECHECK_INTERVAL = 15000

function isManagedDockerLab(type: LabCreationType): boolean {
  return type === 'compose' || type === 'dockerfile'
}

export default function LabPage() {
  // 从子 store 获取响应式数据
  const currentLab = useLabListStore((s) => s.currentLab)
  const currentLabId = useLabListStore((s) => s.currentLab?.labId ?? null)
  const deleteConfirmState = useLabOperationStore((s) => s.deleteConfirmState)
  // 从 facade 获取 actions
  const labStore = useLabStore()
  const showLabCreator = useUIStateStore((s) => s.showLabCreator)
  const closeLabCreator = useUIStateStore((s) => s.closeLabCreator)
  const showConfigManager = useUIStateStore((s) => s.showConfigManager)
  const closeConfigManager = useUIStateStore((s) => s.closeConfigManager)
  const setLastLabId = useUIStateStore((s) => s.setLastLabId)
  const setLabDockerAvailable = useUIStateStore((s) => s.setLabDockerAvailable)
  const lastLabId = useUIStateStore((s) => s.lastLabId)

  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const dockerRecheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const labStoreRef = useRef(labStore)
  const currentLabRef = useRef(currentLab)

  const deleteDialogLab = (() => {
    const state = deleteConfirmState
    if (!state.labId) return null
    const creationType = state.creationType || 'existing'
    const metadataOnlyDelete =
      isManagedDockerLab(creationType) && (dockerStatus?.available === false || state.isOrphan)
    return {
      labId: state.labId,
      name: state.labName,
      creationType,
      containerIds: Array.from({ length: state.containerCount }, (_, i) => String(i)),
      hasWorkspace: state.hasWorkspace,
      workspaceName: state.workspaceName,
      metadataOnlyDelete
    }
  })()

  useEffect(() => {
    labStoreRef.current = labStore
  }, [labStore])

  const checkDocker = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const statusResult = await labApi.checkDocker()
      setDockerStatus(statusResult)
      setLabDockerAvailable(statusResult.available)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setDockerStatus({ available: false, installed: false, error: errorMessage })
      setLabDockerAvailable(false)
      window.api.logger.warn('[LabPage] Docker 检测失败', { error: errorMessage })
    } finally {
      setLoading(false)
    }
  }, [setLabDockerAvailable])

  const checkDockerSilent = useCallback(async (): Promise<void> => {
    try {
      const result = await labApi.checkDocker()
      setDockerStatus(result)
      setLabDockerAvailable(result.available)
    } catch {
      // 静默检测失败时仅保留上一次状态
    }
  }, [setLabDockerAvailable])

  useEffect(() => {
    async function init() {
      await checkDocker()
      await labStoreRef.current.loadLabList()
      if (!currentLabRef.current && lastLabId) {
        await labStoreRef.current.loadLab(lastLabId, false, { silent: true })
      }
      dockerRecheckTimerRef.current = setInterval(() => {
        void checkDockerSilent()
      }, DOCKER_RECHECK_INTERVAL)
    }
    void init()
    return () => {
      if (dockerRecheckTimerRef.current) clearInterval(dockerRecheckTimerRef.current)
    }
  }, [checkDocker, checkDockerSilent, lastLabId])

  useEffect(() => {
    currentLabRef.current = currentLab
  }, [currentLab])

  useEffect(() => {
    if (currentLabId) setLastLabId(currentLabId)
  }, [currentLabId, setLastLabId])

  useEffect(() => {
    if (dockerStatus?.available === false && showConfigManager) {
      closeConfigManager()
    }
  }, [closeConfigManager, dockerStatus?.available, showConfigManager])

  return (
    <div className={`${styles.page} sm-workspace-view`}>
      {loading ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <div className={`sm-spinner sm-spinner--large ${styles.loadingSpinner}`}></div>
          <p>正在准备实验室...</p>
        </div>
      ) : (
        <>
          <LabMainContent currentLab={currentLab} dockerStatus={dockerStatus} />

          <LabCreator
            visible={showLabCreator}
            dockerStatus={dockerStatus}
            onClose={closeLabCreator}
          />

          {dockerStatus?.available === true && (
            <ConfigManager visible={showConfigManager} onClose={closeConfigManager} />
          )}

          <DeleteConfirmDialog
            visible={deleteConfirmState.show}
            isDeleting={deleteConfirmState.isDeleting}
            lab={deleteDialogLab}
            onClose={() => labStore.hideDeleteConfirm()}
            onConfirm={(_labId, options) => labStore.confirmDelete(options)}
          />
        </>
      )}
    </div>
  )
}
