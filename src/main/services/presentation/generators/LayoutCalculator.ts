/**
 * PPT 布局计算器
 * 负责计算幻灯片中各元素的位置和尺寸
 */

import {
  DEFAULT_TEMPLATE_SLIDE_SIZE,
  TEMPLATE_LAYOUT_PRESETS,
  scaleTemplateLayoutPosition
} from '../PptTemplateLayoutPresets'
import type { PptSlideSize, SlideStyle } from '@shared/types/ppt-export'
import type { SlideContentBlock } from '@shared/types/ppt-export'
import type {
  ElementPosition,
  GeneratorStyleConfig,
  SlideContentMetrics,
  SlideRenderOptions,
  SlideRenderKind,
  TemplateDynamicZones
} from './types'
import { DEFAULT_GENERATOR_STYLE, MIN_BODY_FONT_SIZE } from './types'

/**
 * PPT 布局计算器
 * 提供位置解析、尺寸计算等布局相关功能
 */
export class LayoutCalculator {
  private slideWidth: number
  private slideHeight: number
  private style: Required<GeneratorStyleConfig>

  constructor(slideWidth: number, slideHeight: number, style: Required<GeneratorStyleConfig>) {
    this.slideWidth = slideWidth
    this.slideHeight = slideHeight
    this.style = style
  }

  /**
   * 更新幻灯片尺寸
   */
  updateSlideSize(width: number, height: number): void {
    this.slideWidth = width
    this.slideHeight = height
  }

  /**
   * 更新样式配置
   */
  updateStyle(style: Required<GeneratorStyleConfig>): void {
    this.style = style
  }

  /**
   * 获取当前页面尺寸
   */
  getSlideSize(): PptSlideSize {
    return {
      width: this.slideWidth,
      height: this.slideHeight
    }
  }

  /**
   * 获取当前页面尺寸下的模板固定位置
   * @param position - 默认 16:9 页面下的位置
   * @returns 当前尺寸下的位置
   */
  getTemplatePosition(position: { x: number; y: number; w: number; h: number }): ElementPosition {
    return scaleTemplateLayoutPosition(this.getSlideSize(), position)
  }

  /**
   * 将模板/默认位置转换为具体数值坐标
   * @param position - 位置配置
   * @param fallback - 默认值
   * @returns 解析后的坐标
   */
  resolvePosition(
    position: SlideStyle['titlePosition'] | SlideStyle['contentPosition'] | undefined,
    fallback: { x: number; y: number; w: number | string; h: number | string }
  ): ElementPosition {
    return {
      x: this.resolveLength(position?.x, this.slideWidth, fallback.x),
      y: this.resolveLength(position?.y, this.slideHeight, fallback.y),
      w: this.resolveLength(position?.w, this.slideWidth, fallback.w),
      h: this.resolveLength(position?.h, this.slideHeight, fallback.h)
    }
  }

  /**
   * 解析英寸/百分比值为数值坐标
   * @param value - 原始值
   * @param total - 参考总长度
   * @param fallback - 默认值
   * @returns 解析结果
   */
  resolveLength(
    value: number | string | undefined,
    total: number,
    fallback: number | string
  ): number {
    if (typeof value === 'number') {
      return value
    }

    if (typeof value === 'string') {
      const matched = value.match(/^(\d+(?:\.\d+)?)%$/)
      if (matched) {
        return (total * Number.parseFloat(matched[1])) / 100
      }
    }

    if (typeof fallback === 'number') {
      return fallback
    }

    const fallbackMatched = fallback.match(/^(\d+(?:\.\d+)?)%$/)
    if (fallbackMatched) {
      return (total * Number.parseFloat(fallbackMatched[1])) / 100
    }

    return 0
  }

  /**
   * 计算当前页的排版参数
   * 单页模式下会根据内容量缩小字号，避免额外分页
   * @param blocks - 内容块
   * @param contentWidth - 内容区宽度
   * @param contentHeight - 内容区高度
   * @param options - 渲染选项
   * @returns 排版参数
   */
  resolveContentMetrics(
    blocks: SlideContentBlock[],
    contentWidth: number,
    contentHeight: number,
    options?: SlideRenderOptions
  ): SlideContentMetrics {
    const baseFontSize = this.style.bodySize

    if (!options?.singlePage || blocks.length === 0) {
      return {
        bodyFontSize: baseFontSize,
        subheadingFontSize: Math.max(baseFontSize + 2, Math.round(baseFontSize * 1.12)),
        listLineSpacing: 28,
        tableHeaderFontSize: baseFontSize,
        tableBodyFontSize: Math.max(baseFontSize - 2, MIN_BODY_FONT_SIZE)
      }
    }

    const estimatedHeight = blocks.reduce(
      (total, block) => total + this.estimateBlockHeight(block, contentWidth, baseFontSize),
      0
    )

    const scale =
      estimatedHeight > contentHeight && estimatedHeight > 0
        ? Math.max(contentHeight / estimatedHeight, MIN_BODY_FONT_SIZE / baseFontSize)
        : 1

    const bodyFontSize = Math.max(MIN_BODY_FONT_SIZE, Math.floor(baseFontSize * scale))
    return {
      bodyFontSize,
      subheadingFontSize: Math.max(bodyFontSize + 2, Math.round(bodyFontSize * 1.12)),
      listLineSpacing: Math.max(18, Math.round(28 * (bodyFontSize / baseFontSize))),
      tableHeaderFontSize: Math.max(bodyFontSize, Math.floor(bodyFontSize + 1)),
      tableBodyFontSize: Math.max(MIN_BODY_FONT_SIZE - 1, bodyFontSize - 1)
    }
  }

  /**
   * 估算内容块高度，用于控制内容区自动续页
   * @param block - 内容块
   * @param width - 可用宽度
   * @param bodyFontSize - 正文字号
   * @returns 估算高度
   */
  estimateBlockHeight(block: SlideContentBlock, width: number, bodyFontSize: number): number {
    switch (block.type) {
      case 'paragraph':
        return this.calculateParagraphHeight(block.text, width, bodyFontSize) + 0.22
      case 'subheading':
        return (
          this.calculateParagraphHeight(
            block.text,
            width,
            Math.max(bodyFontSize + 2, Math.round(bodyFontSize * 1.12))
          ) + 0.18
        )
      case 'list':
        return this.calculateListHeight(block.items, width, bodyFontSize) + 0.22
      case 'table':
        return this.calculateTableHeight(block.headers, block.rows.length, bodyFontSize) + 0.22
      case 'image':
        return 0.8
      default:
        return 0.5
    }
  }

  /**
   * 计算段落高度（估算）
   * @param text - 文本内容
   * @param width - 宽度
   * @param bodyFontSize - 正文字号
   * @returns 估算的高度（英寸）
   */
  calculateParagraphHeight(text: string, width: number, bodyFontSize: number): number {
    const scale = bodyFontSize / DEFAULT_GENERATOR_STYLE.bodySize
    const charPerLine = Math.max(8, Math.floor(width / (0.15 * scale)))
    const lines = Math.ceil(text.length / charPerLine)
    return Math.max(0.28, lines * 0.25 * scale)
  }

  /**
   * 计算列表高度（估算）
   * @param items - 列表项
   * @param width - 宽度
   * @param bodyFontSize - 正文字号
   * @returns 估算的高度（英寸）
   */
  calculateListHeight(items: string[], width: number, bodyFontSize: number): number {
    const scale = bodyFontSize / DEFAULT_GENERATOR_STYLE.bodySize
    const lineHeight = 0.35 * scale
    let totalHeight = 0
    for (const item of items) {
      const charPerLine = Math.max(8, Math.floor(width / (0.15 * scale)))
      const lines = Math.ceil(item.length / charPerLine)
      totalHeight += Math.max(lineHeight, lines * 0.2 * scale)
    }
    return totalHeight
  }

  /**
   * 计算表格高度（估算）
   * @param _headers - 表头
   * @param rowCount - 行数
   * @param bodyFontSize - 正文字号
   * @returns 估算的高度（英寸）
   */
  calculateTableHeight(_headers: string[], rowCount: number, bodyFontSize: number): number {
    const scale = bodyFontSize / DEFAULT_GENERATOR_STYLE.bodySize
    const headerHeight = 0.5 * scale
    const rowHeight = 0.4 * scale
    return headerHeight + rowCount * rowHeight
  }

  /**
   * 解析模板模式下需要避让的动态区域
   * @param style - 当前页面样式
   * @param options - 渲染选项
   * @param renderKind - 渲染模式
   * @returns 动态区域
   */
  resolveTemplateDynamicZones(
    style: SlideStyle | undefined,
    options: SlideRenderOptions | undefined,
    renderKind: SlideRenderKind
  ): TemplateDynamicZones {
    if (options?.templateSlide) {
      if (renderKind === 'content' || renderKind === 'table') {
        return {
          title: this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.title),
          content: this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.body)
        }
      }

      if (options.layoutHint === 'cover') {
        return {
          title: this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.title),
          content: this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.body)
        }
      }

      if (options.layoutHint === 'ending') {
        return {
          title: this.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.ending.title)
        }
      }

      return {
        title: this.resolvePosition(style?.titlePosition, {
          x: 0.5,
          y: options.subtitle ? 2.5 : 3,
          w: '90%',
          h: options.subtitle ? 1.2 : 1.5
        })
      }
    }

    return {
      title: style?.titlePosition
        ? {
            x: this.resolveLength(style.titlePosition.x, this.slideWidth, 0),
            y: this.resolveLength(style.titlePosition.y, this.slideHeight, 0),
            w: this.resolveLength(style.titlePosition.w, this.slideWidth, 0),
            h: this.resolveLength(style.titlePosition.h, this.slideHeight, 0)
          }
        : undefined,
      content: style?.contentPosition
        ? {
            x: this.resolveLength(style.contentPosition.x, this.slideWidth, 0),
            y: this.resolveLength(style.contentPosition.y, this.slideHeight, 0),
            w: this.resolveLength(style.contentPosition.w, this.slideWidth, 0),
            h: this.resolveLength(style.contentPosition.h, this.slideHeight, 0)
          }
        : undefined
    }
  }

  /**
   * 获取默认幻灯片尺寸
   */
  static getDefaultSlideSize(): { width: number; height: number } {
    return {
      width: DEFAULT_TEMPLATE_SLIDE_SIZE.width,
      height: DEFAULT_TEMPLATE_SLIDE_SIZE.height
    }
  }
}
