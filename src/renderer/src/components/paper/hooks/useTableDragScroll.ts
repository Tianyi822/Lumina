import React, { useRef, useEffect } from 'react'
import { PAPER_ANNOTATION_INTERACTIVE_SELECTOR } from '../composables/usePaperHighlightRenderer'

const TABLE_DRAG_THRESHOLD = 4

interface TableDragState {
  wrap: HTMLElement
  pointerId: number
  startClientX: number
  startScrollLeft: number
  hasDragged: boolean
}

export function useTableDragScroll() {
  const tableDragStateRef = useRef<TableDragState | null>(null)
  const lastTableDragEndedAtRef = useRef(0)

  function isTableWrapHorizontallyScrollable(wrap: HTMLElement): boolean {
    return wrap.scrollWidth > wrap.clientWidth + 1
  }

  function cleanupTableDragListeners(): void {
    window.removeEventListener('pointermove', handleTablePointerMove)
    window.removeEventListener('pointerup', handleTablePointerUp)
    window.removeEventListener('pointercancel', handleTablePointerUp)
  }

  function clearTableDragState(): void {
    tableDragStateRef.current?.wrap.classList.remove('paper-markdown-view__table-wrap--dragging')
    tableDragStateRef.current = null
    cleanupTableDragListeners()
  }

  function shouldIgnoreTableDragTarget(target: Element): boolean {
    return !!target.closest(
      [
        'a',
        'button',
        'input',
        'textarea',
        'select',
        PAPER_ANNOTATION_INTERACTIVE_SELECTOR,
        '.paper-markdown-view__retranslate-btn'
      ].join(', ')
    )
  }

  function handleTablePointerDown(event: React.PointerEvent): void {
    if (event.button !== 0) {
      return
    }

    const target = event.target as Element
    if (!(target instanceof Element) || shouldIgnoreTableDragTarget(target)) {
      return
    }

    const wrap = target.closest<HTMLElement>('.paper-markdown-view__table-wrap')
    if (!wrap || !isTableWrapHorizontallyScrollable(wrap)) {
      return
    }

    clearTableDragState()
    tableDragStateRef.current = {
      wrap,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: wrap.scrollLeft,
      hasDragged: false
    }

    window.addEventListener('pointermove', handleTablePointerMove, { passive: false })
    window.addEventListener('pointerup', handleTablePointerUp)
    window.addEventListener('pointercancel', handleTablePointerUp)
  }

  function handleTablePointerMove(event: PointerEvent): void {
    const state = tableDragStateRef.current
    if (!state || event.pointerId !== state.pointerId) {
      return
    }

    const deltaX = event.clientX - state.startClientX
    if (!state.hasDragged && Math.abs(deltaX) < TABLE_DRAG_THRESHOLD) {
      return
    }

    if (!state.hasDragged) {
      state.hasDragged = true
      state.wrap.classList.add('paper-markdown-view__table-wrap--dragging')
      window.getSelection()?.removeAllRanges()
    }

    event.preventDefault()
    state.wrap.scrollLeft = state.startScrollLeft - deltaX
  }

  function handleTablePointerUp(event: PointerEvent): void {
    const state = tableDragStateRef.current
    if (!state || event.pointerId !== state.pointerId) {
      return
    }

    if (state.hasDragged) {
      lastTableDragEndedAtRef.current = Date.now()
    }

    clearTableDragState()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTableDragState()
    }
  }, [])

  return {
    handlePointerDown: handleTablePointerDown,
    lastDragEndedAt: lastTableDragEndedAtRef
  }
}
