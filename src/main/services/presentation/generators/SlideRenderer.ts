/**
 * PPT 幻灯片渲染器
 * 负责渲染完整的幻灯片（标题页、内容页、表格页）
 */

import type PptxGenJS from 'pptxgenjs'
import type { SlideContentBlock, SlideStyle } from '@shared/types/ppt-export'
import { TEMPLATE_LAYOUT_PRESETS } from '../PptTemplateLayoutPresets'
import { LayoutCalculator } from './LayoutCalculator'
import { ElementRenderer } from './ElementRenderer'
import { TemplateRenderer } from './TemplateRenderer'
import type {
  SlideRenderOptions,
  SlideRenderKind,
  GeneratorStyleConfig
} from './types'

/**
 * 幻灯片创建回调
 */
export type SlideCreateCallback = () => PptxGenJS.Slide

/**
 * PPT 幻灯片渲染器
 * 处理标题页、内容页、表格页的渲染
 */
export class SlideRenderer {
  private style: Required<GeneratorStyleConfig>
  private layoutCalculator: LayoutCalculator
  private elementRenderer: ElementRenderer
  private templateRenderer: TemplateRenderer
  private addSlideCallback: SlideCreateCallback

  constructor(
    style: Required<GeneratorStyleConfig>,
    layoutCalculator: LayoutCalculator,
    elementRenderer: ElementRenderer,
    templateRenderer: TemplateRenderer,
    addSlideCallback: SlideCreateCallback
  ) {
    this.style = style
    this.layoutCalculator = layoutCalculator
    this.elementRenderer = elementRenderer
    this.templateRenderer = templateRenderer
    this.addSlideCallback = addSlideCallback
  }

  /**
   * 更新样式配置
   */
  updateStyle(style: Required<GeneratorStyleConfig>): void {
    this.style = style
  }

  /**
   * 创建标题幻灯片
   * @param title - 主标题
   * @param subtitle - 副标题（可选）
   * @param style - 幻灯片样式（可选）
   * @param options - 渲染选项
   */
  createTitleSlide(
    title: string,
    subtitle?: string,
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    const slide = this.createSlideShell(style, options, 'title')
    const isCoverSlide = options?.layoutHint === 'cover'
    const isEndingSlide = options?.layoutHint === 'ending'

    // 标题位置配置
    const titlePos = isCoverSlide
      ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.title)
      : isEndingSlide
        ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.ending.title)
        : this.layoutCalculator.resolvePosition(style?.titlePosition, {
            x: 0.5,
            y: subtitle ? 2.5 : 3,
            w: '90%',
            h: subtitle ? 1.2 : 1.5
          })

    const subtitlePos = subtitle
      ? isCoverSlide
        ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.subtitle)
        : isEndingSlide
          ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.ending.subtitle)
          : this.layoutCalculator.resolvePosition(undefined, {
              x: 0.5,
              y: titlePos.y + titlePos.h + 0.3,
              w: '90%',
              h: 0.8
            })
      : undefined

    const bodyPos = isCoverSlide
      ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.cover.body)
      : undefined

    // 添加主标题
    this.elementRenderer.addLargeTitle(slide, title, titlePos, options)

    // 添加副标题
    if (subtitle && subtitlePos) {
      this.elementRenderer.addSubtitle(slide, subtitle, subtitlePos, options)
    }

    // 添加封面页正文内容
    if (isCoverSlide && bodyPos && options?.blocks?.length) {
      const metrics = this.layoutCalculator.resolveContentMetrics(
        options.blocks,
        bodyPos.w,
        bodyPos.h,
        options
      )
      let currentY = bodyPos.y

      for (const block of options.blocks) {
        const result = this.elementRenderer.addContentBlock(
          slide,
          block,
          {
            x: bodyPos.x,
            y: currentY,
            w: bodyPos.w,
            h: Math.max(bodyPos.y + bodyPos.h - currentY, 0.4)
          },
          metrics
        )
        currentY = result.nextY
      }
    }
  }

  /**
   * 创建内容幻灯片
   * @param title - 幻灯片标题
   * @param blocks - 内容块数组
   * @param style - 幻灯片样式（可选）
   * @param options - 渲染选项
   */
  createContentSlide(
    title: string,
    blocks: SlideContentBlock[],
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    const titlePos = options?.templateSlide
      ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.title)
      : this.layoutCalculator.resolvePosition(style?.titlePosition, {
          x: 0.5,
          y: 0.5,
          w: '90%',
          h: 0.8
        })

    const contentPos = options?.templateSlide
      ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.body)
      : this.layoutCalculator.resolvePosition(style?.contentPosition, {
          x: 0.5,
          y: 1.5,
          w: '90%',
          h: 5.5
        })

    const metrics = this.layoutCalculator.resolveContentMetrics(
      blocks,
      contentPos.w,
      contentPos.h,
      options
    )

    const createSlideWithHeader = (): { slide: PptxGenJS.Slide; startY: number } => {
      const slide = this.createSlideShell(style, options, 'content')

      this.elementRenderer.addTitle(slide, title, titlePos, options)

      let startY = contentPos.y
      if (options?.subtitle) {
        const subtitleY = titlePos.y + titlePos.h + 0.12
        const subtitleHeight = Math.min(0.6, Math.max(0.35, contentPos.y - subtitleY - 0.12))

        this.elementRenderer.addGraySubtitle(
          slide,
          options.subtitle,
          {
            x: titlePos.x,
            y: subtitleY,
            w: titlePos.w,
            h: subtitleHeight
          },
          Math.max(metrics.bodyFontSize, this.style.bodySize),
          options
        )
        startY = Math.max(contentPos.y, subtitleY + subtitleHeight + 0.12)
      }

      return { slide, startY }
    }

    const initial = createSlideWithHeader()
    let slide = initial.slide
    let currentY = initial.startY
    const maxY = contentPos.y + contentPos.h

    for (const block of blocks) {
      const estimatedHeight = this.layoutCalculator.estimateBlockHeight(
        block,
        contentPos.w,
        metrics.bodyFontSize
      )
      if (!options?.singlePage && currentY > contentPos.y && currentY + estimatedHeight > maxY) {
        const nextSlide = createSlideWithHeader()
        slide = nextSlide.slide
        currentY = nextSlide.startY
      }

      const result = this.elementRenderer.addContentBlock(
        slide,
        block,
        {
          x: contentPos.x,
          y: currentY,
          w: contentPos.w,
          h: Math.max(maxY - currentY, 0.5)
        },
        metrics
      )
      currentY = result.nextY
    }
  }

  /**
   * 创建表格幻灯片
   * @param title - 幻灯片标题
   * @param tableData - 表格数据
   * @param style - 幻灯片样式（可选）
   * @param options - 渲染选项
   */
  createTableSlide(
    title: string,
    tableData: { headers: string[]; rows: string[][] },
    style?: SlideStyle,
    options?: SlideRenderOptions
  ): void {
    const slide = this.createSlideShell(style, options, 'table')

    const titlePos = options?.templateSlide
      ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.title)
      : this.layoutCalculator.resolvePosition(style?.titlePosition, {
          x: 0.5,
          y: 0.5,
          w: '90%',
          h: 0.8
        })

    const contentPos = options?.templateSlide
      ? this.layoutCalculator.getTemplatePosition(TEMPLATE_LAYOUT_PRESETS.content.body)
      : this.layoutCalculator.resolvePosition(style?.contentPosition, {
          x: 0.5,
          y: 1.5,
          w: '90%',
          h: 5.5
        })

    const metrics = this.layoutCalculator.resolveContentMetrics(
      [{ type: 'table', headers: tableData.headers, rows: tableData.rows }],
      contentPos.w,
      contentPos.h,
      options
    )

    // 添加标题
    this.elementRenderer.addTitle(slide, title, titlePos, options)

    // 添加表格
    this.elementRenderer.addTable(
      slide,
      tableData.headers,
      tableData.rows,
      {
        x: contentPos.x,
        y: contentPos.y,
        w: contentPos.w
      },
      metrics
    )
  }

  /**
   * 创建幻灯片骨架并绘制模板静态元素
   * 注意：只复用模板的排版布局（位置、颜色等），不复用模板中的图片内容
   * @param style - 当前页面样式
   * @param options - 渲染选项
   * @param renderKind - 渲染模式
   * @returns 幻灯片实例
   */
  private createSlideShell(
    style?: SlideStyle,
    options?: SlideRenderOptions,
    renderKind: SlideRenderKind = 'content'
  ): PptxGenJS.Slide {
    const slide = this.addSlideCallback()
    this.templateRenderer.setSlideBackground(slide, style)

    if (options?.templateSlide) {
      // 不添加背景图片，只保留纯色背景
      // 只渲染模板的形状装饰，不渲染图片
      this.templateRenderer.renderTemplateDecorations(
        slide,
        options.templateSlide,
        style,
        options,
        renderKind
      )
    }

    return slide
  }
}
