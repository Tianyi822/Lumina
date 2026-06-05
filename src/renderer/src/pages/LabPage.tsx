import { useState, useEffect, useRef } from 'react'
import { useLabStore, useLabListStore, useLabOperationStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import LabMainContent from '@renderer/components/lab/LabMainContent'
import LabCreator from '@renderer/components/lab/LabCreator'
import DeleteConfirmDialog from '@renderer/components/lab/DeleteConfirmDialog'
import styles from './LabPage.module.css'

export default function LabPage() {
  const currentLab = useLabListStore((s) => s.currentLab)
  const currentLabId = useLabListStore((s) => s.currentLab?.labId ?? null)
  const deleteConfirmState = useLabOperationStore((s) => s.deleteConfirmState)
  const labStore = useLabStore()
  const showLabCreator = useUIStateStore((s) => s.showLabCreator)
  const closeLabCreator = useUIStateStore((s) => s.closeLabCreator)
  const setLastLabId = useUIStateStore((s) => s.setLastLabId)
  const lastLabId = useUIStateStore((s) => s.lastLabId)

  const [loading, setLoading] = useState(true)
  const labStoreRef = useRef(labStore)
  const currentLabRef = useRef(currentLab)

  const deleteDialogLab = (() => {
    const state = deleteConfirmState
    if (!state.labId) return null
    return {
      labId: state.labId,
      name: state.labName,
      creationType: state.creationType || 'ssh'
    }
  })()

  useEffect(() => {
    labStoreRef.current = labStore
  }, [labStore])

  useEffect(() => {
    async function init() {
      await labStoreRef.current.loadLabList()
      if (!currentLabRef.current && lastLabId) {
        await labStoreRef.current.loadLab(lastLabId, false, { silent: true })
      }
    }
    void init().finally(() => setLoading(false))
  }, [lastLabId])

  useEffect(() => {
    currentLabRef.current = currentLab
  }, [currentLab])

  useEffect(() => {
    if (currentLabId) setLastLabId(currentLabId)
  }, [currentLabId, setLastLabId])

  return (
    <div className={`${styles.page} sm-workspace-view`}>
      {loading ? (
        <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
          <div className={`sm-spinner sm-spinner--large ${styles.loadingSpinner}`}></div>
          <p>正在准备实验室...</p>
        </div>
      ) : (
        <>
          <LabMainContent currentLab={currentLab} />

          <LabCreator visible={showLabCreator} onClose={closeLabCreator} />

          <DeleteConfirmDialog
            visible={deleteConfirmState.show}
            isDeleting={deleteConfirmState.isDeleting}
            lab={deleteDialogLab}
            onClose={() => labStore.hideDeleteConfirm()}
            onConfirm={(_labId) => labStore.confirmDelete()}
          />
        </>
      )}
    </div>
  )
}
