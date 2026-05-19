import { useState, useEffect, useCallback, useRef } from 'react'
import { useLabStoreReact } from '@renderer/stores/lab/reactAdapters'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotification } from '@renderer/composables/useNotification'
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
  const labStore = useLabStoreReact()
  const showLabCreator = useUIStateStore((s) => s.showLabCreator)
  const closeLabCreator = useUIStateStore((s) => s.closeLabCreator)
  const showConfigManager = useUIStateStore((s) => s.showConfigManager)
  const closeConfigManager = useUIStateStore((s) => s.closeConfigManager)
  const setLastLabId = useUIStateStore((s) => s.setLastLabId)
  const lastLabId = useUIStateStore((s) => s.lastLabId)
  const notify = useNotification()

  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [recheckingDocker, setRecheckingDocker] = useState(false)
  const dockerNotifyIdRef = useRef<string | null>(null)
  const dockerRecheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const labStoreRef = useRef(labStore)
  const notifyRef = useRef(notify)
  const recheckingDockerRef = useRef(recheckingDocker)

  const currentLabId = labStore.currentLabId
  const deleteConfirmState = labStore.deleteConfirmState || {
    show: false,
    isDeleting: false,
    labId: '',
    labName: '',
    containerCount: 0,
    hasWorkspace: false,
    workspaceName: '',
    creationType: 'existing' as LabCreationType,
    isOrphan: false
  }

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

  useEffect(() => {
    notifyRef.current = notify
  }, [notify])

  useEffect(() => {
    recheckingDockerRef.current = recheckingDocker
  }, [recheckingDocker])

  const showDockerUnavailableNotify = useCallback((status: DockerStatus): void => {
    if (dockerNotifyIdRef.current) return
    const title = status.installed ? 'Docker 未启动' : 'Docker 未安装'
    const message = status.installed
      ? '请启动 Docker 服务，然后点击页面中的"重新检测 Docker"按钮。SSH 远程实验室不受影响。'
      : '实验室工作区依赖本机 Docker 运行时，请安装后点击页面中的"重新检测 Docker"按钮。SSH 远程实验室不受影响。'
    const id = notifyRef.current.warning(title, message, {
      source: 'lab',
      sticky: true,
      dedupeKey: `docker:${status.installed ? 'stopped' : 'missing'}`
    })
    if (id) dockerNotifyIdRef.current = id
  }, [])

  const checkDocker = useCallback(
    async (showFullLoading = true): Promise<void> => {
      if (!showFullLoading && recheckingDockerRef.current) return
      try {
        if (showFullLoading) setLoading(true)
        else setRecheckingDocker(true)
        const statusResult = await labApi.checkDocker()
        setDockerStatus(statusResult)
        if (!statusResult.available) showDockerUnavailableNotify(statusResult)
        else if (dockerNotifyIdRef.current) {
          notifyRef.current.dismiss(dockerNotifyIdRef.current)
          dockerNotifyIdRef.current = null
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        setDockerStatus({ available: false, installed: false, error: errorMessage })
        notifyRef.current.error('Docker 检测失败', errorMessage, {
          source: 'lab',
          dedupeKey: 'lab:checkDocker'
        })
      } finally {
        if (showFullLoading) setLoading(false)
        else setRecheckingDocker(false)
      }
    },
    [showDockerUnavailableNotify]
  )

  const checkDockerSilent = useCallback(async (): Promise<void> => {
    try {
      const result = await labApi.checkDocker()
      setDockerStatus(result)
      if (result.available && dockerNotifyIdRef.current) {
        notifyRef.current.dismiss(dockerNotifyIdRef.current)
        dockerNotifyIdRef.current = null
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    async function init() {
      await checkDocker()
      await labStoreRef.current.loadLabList?.()
      if (!labStoreRef.current.currentLab && lastLabId) {
        await labStoreRef.current.loadLab(lastLabId, false, { silent: true })
      }
      dockerRecheckTimerRef.current = setInterval(() => {
        void checkDockerSilent()
      }, DOCKER_RECHECK_INTERVAL)
    }
    void init()
    return () => {
      if (dockerRecheckTimerRef.current) clearInterval(dockerRecheckTimerRef.current)
      if (dockerNotifyIdRef.current) {
        notifyRef.current.dismiss(dockerNotifyIdRef.current)
        dockerNotifyIdRef.current = null
      }
    }
  }, [checkDocker, checkDockerSilent, lastLabId])

  useEffect(() => {
    if (currentLabId) setLastLabId(currentLabId)
  }, [currentLabId, setLastLabId])

  return (
    <div className={`${styles.page} sm-workspace-view`}>
      {loading ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <div className={`sm-spinner sm-spinner--large ${styles.loadingSpinner}`}></div>
          <p>正在检测 Docker...</p>
        </div>
      ) : (
        <>
          <LabMainContent
            currentLab={labStore.currentLab}
            dockerStatus={dockerStatus}
            recheckingDocker={recheckingDocker}
            onRecheckDocker={() => checkDocker(false)}
          />

          <LabCreator
            visible={showLabCreator}
            dockerStatus={dockerStatus}
            onClose={closeLabCreator}
          />

          <ConfigManager visible={showConfigManager} onClose={closeConfigManager} />

          <DeleteConfirmDialog
            visible={deleteConfirmState.show}
            isDeleting={deleteConfirmState.isDeleting}
            lab={deleteDialogLab}
            onClose={() => labStore.hideDeleteConfirm?.()}
            onConfirm={(_labId, options) => labStore.confirmDelete?.(options)}
          />
        </>
      )}
    </div>
  )
}
