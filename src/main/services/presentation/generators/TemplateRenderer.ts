/**
 * PPT 模板渲染器
 * 负责渲染模板中的装饰元素和背景
 */

import type PptxGenJS from 'pptxgenjs'
import type {
  PptTemplateElementAnalysis,
  PptTemplateSlideAnalysis
} from '@shared/types/ppt-template'
import type { SlideStyle } from '@shared/types/ppt-export'
import type {
  SlideRenderOptions,
  SlideRenderKind,
  TemplateDynamicZones,
  GeneratorStyleConfig
} from './types'
import { LayoutCalculator } from './LayoutCalculator'

/**
 * PPT 模板渲染器
 * 处理模板装饰元素、背景等渲染
 */
export class TemplateRenderer {
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
   * 绘制模板中的静态装饰元素
   * 只复用非正文区域的图形（形状），不复用模板中的图片内容
   * @param slide - 当前幻灯片
   * @param templateSlide - 模板页分析结果
   * @param style - 当前页面样式
   * @param options - 渲染选项
   * @param renderKind - 渲染模式
   */
  renderTemplateDecorations(
    slide: PptxGenJS.Slide,
    templateSlide: PptTemplateSlideAnalysis,
    style: SlideStyle | undefined,
    options: SlideRenderOptions | undefined,
    renderKind: SlideRenderKind = 'content'
  ): void {
    const zones = this.layoutCalculator.resolveTemplateDynamicZones(style, options, renderKind)
    const elements = [...templateSlide.elements].sort((left, right) => left.zIndex - right.zIndex)

    for (const element of elements) {
      if (!this.shouldRenderTemplateElement(element, zones)) {
        continue
      }

      // 只渲染形状，不渲染图片
      if (element.kind === 'shape') {
        this.renderTemplateShape(slide, element)
      }
    }
  }

  /**
   * 判断模板元素是否应该复用
   * @param element - 模板元素
   * @param zones - 动态内容区域
   * @returns 是否复用
   */
  shouldRenderTemplateElement(
    element: PptTemplateElementAnalysis,
    zones: TemplateDynamicZones
  ): boolean {
    if (
      element.kind === 'placeholder' ||
      element.kind === 'table' ||
      element.kind === 'chart' ||
      element.kind === 'image'
    ) {
      return false
    }

    if (element.kind !== 'shape') {
      return false
    }

    if (!zones.title && !zones.content) {
      return true
    }

    return !this.isElementOverlappingContentZone(element, zones)
  }

  /**
   * 判断元素是否与动态内容区域重叠
   * @param element - 模板元素
   * @param zones - 动态内容区域
   * @returns 是否重叠
   */
  isElementOverlappingContentZone(
    element: PptTemplateElementAnalysis,
    zones: TemplateDynamicZones
  ): boolean {
    const elementRect = {
      x: element.x / 914400,
      y: element.y / 914400,
      w: element.cx / 914400,
      h: element.cy / 914400
    }

    const zoneList = [zones.title, zones.content].filter((zone): zone is NonNullable<typeof zone> =>
      Boolean(zone)
    )

    return zoneList.some((zoneRect) => {
      const overlapX = Math.max(
        0,
        Math.min(elementRect.x + elementRect.w, zoneRect.x + zoneRect.w) -
          Math.max(elementRect.x, zoneRect.x)
      )
      const overlapY = Math.max(
        0,
        Math.min(elementRect.y + elementRect.h, zoneRect.y + zoneRect.h) -
          Math.max(elementRect.y, zoneRect.y)
      )

      const overlapArea = overlapX * overlapY
      const elementArea = elementRect.w * elementRect.h

      return elementArea > 0 && overlapArea / elementArea > 0.2
    })
  }

  /**
   * 绘制模板形状
   * @param slide - 当前幻灯片
   * @param element - 模板形状元素
   */
  renderTemplateShape(slide: PptxGenJS.Slide, element: PptTemplateElementAnalysis): void {
    const shapePreset = element.shape?.preset
    if (!shapePreset) {
      return
    }

    slide.addShape(shapePreset as PptxGenJS.ShapeType, {
      x: element.x / 914400,
      y: element.y / 914400,
      w: element.cx / 914400,
      h: element.cy / 914400,
      fill: element.shape?.fillColor
        ? { color: this.resolveTemplateColor(element.shape.fillColor) }
        : { color: 'FFFFFF', transparency: 100 },
      line: element.shape?.strokeColor
        ? {
            color: this.resolveTemplateColor(element.shape.strokeColor),
            width: element.shape.strokeWidth ? element.shape.strokeWidth / 12700 : 1
          }
        : { color: 'FFFFFF', transparency: 100 }
    })
  }

  /**
   * 解析模板颜色
   * 支持常见主题色占位符
   * @param color - 模板颜色
   * @returns 十六进制颜色
   */
  resolveTemplateColor(color: string): string {
    const normalized = color.replace(/^#/, '').toUpperCase()

    switch (normalized) {
      case 'ACCENT1':
        return this.style.primaryColor
      case 'BG1':
        return this.style.backgroundColor
      case 'TX1':
        return '333333'
      case 'BG2':
        return 'F7F8FA'
      default:
        return /^[0-9A-F]{6}$/.test(normalized) ? normalized : this.style.primaryColor
    }
  }

  /**
   * 设置幻灯片背景
   * @param slide - 幻灯片对象
   * @param style - 幻灯片样式
   */
  setSlideBackground(slide: PptxGenJS.Slide, style?: SlideStyle): void {
    const bgColor = style?.backgroundColor || this.style.backgroundColor
    slide.background = { color: bgColor }
  }
}
