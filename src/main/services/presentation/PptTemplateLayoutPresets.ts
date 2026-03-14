/**
 * PPT 模板固定版式
 * 统一维护模板模式下的稳定坐标，避免预览与导出分叉
 */

import type { PptSlideSize } from '@shared/types/ppt-export'

/** 默认 16:9 页面尺寸 */
export const DEFAULT_TEMPLATE_SLIDE_SIZE: PptSlideSize = {
  width: 13.333,
  height: 7.5
}

/**
 * 基于默认页面尺寸定义的固定区域
 */
interface TemplateLayoutRegion {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 模板模式下的稳定版式区域
 */
export const TEMPLATE_LAYOUT_PRESETS = {
  cover: {
    title: { x: 1.6, y: 2.15, w: 10.1, h: 0.9 },
    subtitle: { x: 2.2, y: 3.05, w: 8.9, h: 0.45 },
    body: { x: 3.2, y: 4.15, w: 6.8, h: 1.4 }
  },
  content: {
    title: { x: 2.6, y: 0.32, w: 9.5, h: 0.55 },
    body: { x: 2.65, y: 1.35, w: 9.7, h: 5.5 }
  },
  ending: {
    title: { x: 2.3, y: 2.45, w: 8.8, h: 0.75 },
    subtitle: { x: 2.1, y: 3.25, w: 9.2, h: 0.5 }
  }
} satisfies Record<string, Record<string, TemplateLayoutRegion>>

/**
 * 将固定版式按当前页面尺寸缩放
 * @param slideSize - 当前页面尺寸
 * @param position - 默认 16:9 页面下的位置
 * @returns 当前尺寸下的位置
 */
export function scaleTemplateLayoutPosition(
  slideSize: PptSlideSize,
  position: TemplateLayoutRegion
): { x: number; y: number; w: number; h: number } {
  return {
    x: (position.x / DEFAULT_TEMPLATE_SLIDE_SIZE.width) * slideSize.width,
    y: (position.y / DEFAULT_TEMPLATE_SLIDE_SIZE.height) * slideSize.height,
    w: (position.w / DEFAULT_TEMPLATE_SLIDE_SIZE.width) * slideSize.width,
    h: (position.h / DEFAULT_TEMPLATE_SLIDE_SIZE.height) * slideSize.height
  }
}
