import {
  PAPER_FIGURE_PREVIEW_MARGIN,
  PAPER_FIGURE_PREVIEW_MIN_HEIGHT,
  PAPER_FIGURE_PREVIEW_MIN_WIDTH
} from '../shared'
import type { PaperFigureItem } from '@shared/types/paper'

export interface FigurePreviewDimensions {
  width: number
  height: number
}

export interface FigurePreviewPosition extends FigurePreviewDimensions {
  left: number
  top: number
}

export function clampPreviewWidth(width: number, viewportWidth?: number): number {
  const w =
    typeof viewportWidth === 'number'
      ? viewportWidth
      : typeof window !== 'undefined'
        ? window.innerWidth
        : Infinity
  const maxWidth = Math.max(w - PAPER_FIGURE_PREVIEW_MARGIN * 2, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
  return Math.min(Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH), maxWidth)
}

export function clampPreviewHeight(height: number, viewportHeight?: number): number {
  const h =
    typeof viewportHeight === 'number'
      ? viewportHeight
      : typeof window !== 'undefined'
        ? window.innerHeight
        : Infinity
  const maxHeight = Math.max(h - PAPER_FIGURE_PREVIEW_MARGIN * 2, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
  return Math.min(Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT), maxHeight)
}

export function clampPreviewLeft(left: number, width: number, viewportWidth?: number): number {
  const w =
    typeof viewportWidth === 'number'
      ? viewportWidth
      : typeof window !== 'undefined'
        ? window.innerWidth
        : Infinity
  return Math.min(
    Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN),
    Math.max(w - width - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
  )
}

export function clampPreviewTop(top: number, height: number, viewportHeight?: number): number {
  const h =
    typeof viewportHeight === 'number'
      ? viewportHeight
      : typeof window !== 'undefined'
        ? window.innerHeight
        : Infinity
  return Math.min(
    Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN),
    Math.max(h - height - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
  )
}

export function getFigureRatio(item: PaperFigureItem): number {
  return item.bbox.width > 0 && item.bbox.height > 0 ? item.bbox.height / item.bbox.width : 0.75
}

const PREVIEW_CHROME_HEIGHT_ESTIMATE = 128

export function getFigurePreviewHeight(width: number, ratio: number): number {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.75
  return width * safeRatio + PREVIEW_CHROME_HEIGHT_ESTIMATE
}
