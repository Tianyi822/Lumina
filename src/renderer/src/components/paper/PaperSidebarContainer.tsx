/**
 * PaperSidebar 容器组件
 *
 * 使用 Zustand 直接访问 paperReaderStore，将 store 数据作为 props 传递给 PaperSidebar。
 */

import { useCallback } from 'react'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import type { OcrProgressInfo, PaperDocument } from '@shared/types/paper'
import PaperSidebar from './PaperSidebar'

interface PaperSidebarContainerProps {
  searchQuery: string
}

export default function PaperSidebarContainer({ searchQuery }: PaperSidebarContainerProps) {
  const store = usePaperReaderStore()

  const papers = (store.papers ?? []) as PaperDocument[]
  const currentPaperId = (store.currentPaperId ?? null) as string | null
  const renderProgressByPaperId = (store.renderProgressByPaperId ?? {}) as Record<
    string,
    RenderingProgress
  >
  const ocrProgressByPaperId = (store.ocrProgressByPaperId ?? {}) as Record<string, OcrProgressInfo>
  const hasTranslationByPaperId = (store.hasTranslationByPaperId ?? {}) as Record<string, boolean>

  // Filter papers by search query
  const filteredPapers = searchQuery.trim()
    ? papers.filter((p: { fileName: string }) =>
        p.fileName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : papers

  const handleSelectPaper = useCallback(
    (paperId: string) => {
      store.selectPaper(paperId)
      useUIStateStore.getState().setCurrentView('paper')
    },
    [store]
  )

  const handleDeletePaper = useCallback(
    async (paperId: string) => {
      const paper = papers.find((p: { id: string }) => p.id === paperId)
      const confirmed = await useNotificationCenterStore
        .getState()
        .requestConfirm(
          `确定要删除论文"${paper?.fileName || paperId}"吗？此操作不可撤销。`,
          '删除论文',
          true
        )
      if (!confirmed) return

      void store.deletePaper(paperId)
    },
    [papers, store]
  )

  const handleDeleteTranslation = useCallback(
    async (paperId: string) => {
      const confirmed = await useNotificationCenterStore
        .getState()
        .requestConfirm('确定要删除该论文的翻译吗？', '删除翻译', true)
      if (!confirmed) return

      void store.deleteTranslation(paperId)
    },
    [store]
  )

  const handleRetryPaper = useCallback(
    (paperId: string) => {
      void store.retryPaper(paperId)
    },
    [store]
  )

  return (
    <PaperSidebar
      papers={filteredPapers}
      currentPaperId={currentPaperId}
      renderProgressByPaperId={renderProgressByPaperId}
      ocrProgressByPaperId={ocrProgressByPaperId}
      hasTranslationByPaperId={hasTranslationByPaperId}
      translatedTitleByPaperId={{}}
      translationVisible={store.translationVisible ?? false}
      onSelectPaper={handleSelectPaper}
      onDeletePaper={handleDeletePaper}
      onDeleteTranslation={handleDeleteTranslation}
      onRetryPaper={handleRetryPaper}
    />
  )
}
