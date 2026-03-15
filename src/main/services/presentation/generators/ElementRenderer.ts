/**
 * PPT 元素渲染器
 * 负责渲染文本、列表、表格等内容元素
 */

import type PptxGenJS from 'pptxgenjs'
import type { SlideContentBlock } from '@shared/types/ppt-export'
import type { ElementPosition, SlideContentMetrics, GeneratorStyleConfig } from './types'
import { LayoutCalculator } from './LayoutCalculator'

/**
 * 内容块渲染结果
 */
export interface ContentBlockResult {
  nextY: number
}

/**
 * PPT 元素渲染器
 * 处理段落、列表、表格等元素的渲染
 */
export class ElementRenderer {
  private style: Required<GeneratorStyleConfig>
  private layoutCalculator: LayoutCalculator

  constructor(style: Required<GeneratorStyleConfig>, layoutCalculator: LayoutCalculator) {
    this.style = style
    this.layoutCalculator = layoutCalculator
  }

  /**
   * 更新样式配置
   */
  updateStyle(style: Required<GeneratorStyleConfig>): void {
    this.style = style
  }

  /**
   * 添加内容块到幻灯片
   * @param slide - 幻灯片对象
   * @param block - 内容块
   * @param position - 位置信息
   * @param metrics - 排版参数
   * @returns 下一个内容的 Y 坐标
   */
  addContentBlock(
    slide: PptxGenJS.Slide,
    block: SlideContentBlock,
    position: ElementPosition,
    metrics: SlideContentMetrics
  ): ContentBlockResult {
    const { x, y, w, h } = position

    switch (block.type) {
      case 'paragraph':
        this.addParagraph(slide, block.text, { x, y, w, h }, metrics.bodyFontSize)
        return {
          nextY:
            y +
            this.layoutCalculator.calculateParagraphHeight(block.text, w, metrics.bodyFontSize) +
            0.22
        }

      case 'list':
        this.addList(slide, block.items, block.ordered, { x, y, w, h }, metrics)
        return {
          nextY:
            y + this.layoutCalculator.calculateListHeight(block.items, w, metrics.bodyFontSize) + 0.22
        }

      case 'table':
        this.addTable(slide, block.headers, block.rows, { x, y, w }, metrics)
        return {
          nextY:
            y +
            this.layoutCalculator.calculateTableHeight(
              block.headers,
              block.rows.length,
              metrics.bodyFontSize
            ) +
            0.22
        }

      case 'image':
        // 图片暂时不支持嵌入，添加占位文本
        this.addParagraph(
          slide,
          `[图片: ${block.alt || '未命名'}]`,
          { x, y, w, h: 0.5 },
          metrics.bodyFontSize
        )
        return { nextY: y + 0.8 }

      default:
        return { nextY: y }
    }
  }

  /**
   * 添加段落文本
   * @param slide - 幻灯片对象
   * @param text - 文本内容
   * @param position - 位置信息
   * @param fontSize - 字号
   */
  addParagraph(
    slide: PptxGenJS.Slide,
    text: string,
    position: ElementPosition,
    fontSize: number
  ): void {
    slide.addText(text, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize,
      color: '333333',
      fontFace: this.style.bodyFont,
      align: 'left',
      valign: 'top',
      fit: 'shrink'
    })
  }

  /**
   * 添加列表
   * @param slide - 幻灯片对象
   * @param items - 列表项
   * @param ordered - 是否有序列表
   * @param position - 位置信息
   * @param metrics - 排版参数
   */
  addList(
    slide: PptxGenJS.Slide,
    items: string[],
    ordered: boolean,
    position: ElementPosition,
    metrics: SlideContentMetrics
  ): void {
    const listText = items
      .map((item, index) => `${ordered ? `${index + 1}.` : '•'} ${item}`)
      .join('\n')

    slide.addText(listText, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize: metrics.bodyFontSize,
      color: '333333',
      fontFace: this.style.bodyFont,
      align: 'left',
      valign: 'top',
      lineSpacing: metrics.listLineSpacing,
      fit: 'shrink'
    })
  }

  /**
   * 添加表格
   * @param slide - 幻灯片对象
   * @param headers - 表头
   * @param rows - 行数据
   * @param position - 位置信息（不需要高度）
   * @param metrics - 排版参数
   */
  addTable(
    slide: PptxGenJS.Slide,
    headers: string[],
    rows: string[][],
    position: { x: number; y: number; w: number },
    metrics: SlideContentMetrics
  ): void {
    const colWidth = position.w / headers.length

    // 构建表格数据
    const tableData = [
      headers.map((h) => ({
        text: h,
        options: {
          bold: true,
          fontSize: metrics.tableHeaderFontSize,
          color: 'FFFFFF',
          fill: { color: this.style.primaryColor }
        }
      })),
      ...rows.map((row) =>
        row.map((cell) => ({
          text: cell,
          options: {
            fontSize: metrics.tableBodyFontSize,
            color: '333333',
            border: { pt: 1, color: 'CCCCCC' }
          }
        }))
      )
    ]

    slide.addTable(tableData, {
      x: position.x,
      y: position.y,
      w: position.w,
      border: { pt: 1, color: 'CCCCCC' },
      colW: headers.map(() => colWidth)
    })
  }

  /**
   * 添加标题文本
   * @param slide - 幻灯片对象
   * @param title - 标题内容
   * @param position - 位置信息
   * @param options - 渲染选项
   */
  addTitle(
    slide: PptxGenJS.Slide,
    title: string,
    position: ElementPosition,
    options?: { singlePage?: boolean }
  ): void {
    slide.addText(title, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize: this.style.titleSize,
      bold: true,
      color: this.style.primaryColor,
      fontFace: this.style.titleFont,
      fit: options?.singlePage ? 'shrink' : 'none'
    })
  }

  /**
   * 添加大标题文本（用于标题页）
   * @param slide - 幻灯片对象
   * @param title - 标题内容
   * @param position - 位置信息
   * @param options - 渲染选项
   */
  addLargeTitle(
    slide: PptxGenJS.Slide,
    title: string,
    position: ElementPosition,
    options?: { singlePage?: boolean }
  ): void {
    slide.addText(title, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize: this.style.titleSize + 8,
      bold: true,
      color: this.style.primaryColor,
      fontFace: this.style.titleFont,
      align: 'center',
      valign: 'middle',
      fit: options?.singlePage ? 'shrink' : 'none'
    })
  }

  /**
   * 添加副标题文本
   * @param slide - 幻灯片对象
   * @param subtitle - 副标题内容
   * @param position - 位置信息
   * @param options - 渲染选项
   */
  addSubtitle(
    slide: PptxGenJS.Slide,
    subtitle: string,
    position: ElementPosition,
    options?: { singlePage?: boolean }
  ): void {
    slide.addText(subtitle, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize: this.style.bodySize + 4,
      color: '666666',
      fontFace: this.style.bodyFont,
      align: 'center',
      valign: 'middle',
      fit: options?.singlePage ? 'shrink' : 'none'
    })
  }

  /**
   * 添加灰色小标题（用于内容页副标题）
   * @param slide - 幻灯片对象
   * @param text - 文本内容
   * @param position - 位置信息
   * @param fontSize - 字号
   * @param options - 渲染选项
   */
  addGraySubtitle(
    slide: PptxGenJS.Slide,
    text: string,
    position: ElementPosition,
    fontSize: number,
    options?: { singlePage?: boolean }
  ): void {
    slide.addText(text, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      fontSize,
      color: '666666',
      fontFace: this.style.bodyFont,
      fit: options?.singlePage ? 'shrink' : 'none'
    })
  }
}
