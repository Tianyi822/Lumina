import { useCallback, useEffect, useRef, useState } from 'react'
import type { WriterDocument } from '@shared/types/writer'
import WriterEditor from '@renderer/components/writer/WriterEditor'
import type { WriterSnapshot } from '@renderer/components/writer/WriterEditor'
import {
  WriterAutosaveController,
  flushWriterAutosaveAndAcknowledge
} from '@renderer/components/writer/writerAutosave'
import { useWriterLibraryStore } from '@renderer/stores/writer'
import styles from './WritingPage.module.css'

/** 写作工作区负责文档加载和主进程退出握手，正文生命周期留给编辑器。 */
export default function WritingPage() {
  const currentDocumentId = useWriterLibraryStore((state) => state.currentDocumentId)
  const createAndOpen = useWriterLibraryStore((state) => state.createAndOpen)
  const [document, setDocument] = useState<WriterDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autosaveControllerRef = useRef<WriterAutosaveController<WriterSnapshot> | null>(null)

  const handleAutosaveControllerChange = useCallback(
    (controller: WriterAutosaveController<WriterSnapshot> | null): void => {
      autosaveControllerRef.current = controller
    },
    []
  )

  useEffect(() => {
    let active = true
    if (!currentDocumentId) {
      setDocument(null)
      setLoading(false)
      setError(null)
      return () => {
        active = false
      }
    }

    setLoading(true)
    setError(null)
    void window.api.writer
      .get(currentDocumentId)
      .then((result) => {
        if (!active) return
        if (!result.success || !result.data) {
          setDocument(null)
          setError(result.error || '加载文档失败')
          return
        }
        setDocument(result.data)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setDocument(null)
        setError(loadError instanceof Error ? loadError.message : '加载文档失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentDocumentId])

  useEffect(
    () =>
      window.api.writer.onFlushRequested(async () => {
        const controller = autosaveControllerRef.current
        if (controller) {
          await flushWriterAutosaveAndAcknowledge(controller, () =>
            window.api.writer.acknowledgeFlush()
          )
          return
        }
        await window.api.writer.acknowledgeFlush()
      }),
    []
  )

  const showDocument = document?.id === currentDocumentId

  return (
    <main className={styles.page}>
      {showDocument && document ? (
        <WriterEditor
          key={document.id}
          document={document}
          onAutosaveControllerChange={handleAutosaveControllerChange}
        />
      ) : (
        <div className={styles.state}>
          {loading ? <span>正在加载文档…</span> : null}
          {!loading && error ? (
            <span className={styles.error} role="alert">
              {error}
            </span>
          ) : null}
          {!loading && !error && !currentDocumentId ? (
            <>
              <span>选择一个文档，或开始新的写作</span>
              <button
                type="button"
                className="sm-button sm-button--secondary"
                onClick={() => void createAndOpen()}
              >
                新建文档
              </button>
            </>
          ) : null}
        </div>
      )}
    </main>
  )
}
