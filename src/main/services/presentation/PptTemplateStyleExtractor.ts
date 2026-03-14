/**
 * PPT 模板样式提取器
 * 从模板分析结果（analysis.json）中提取可用的样式信息
 */

import { logger } from '@main/services/logger'
import type {
  PptSlideSize,
  PptStyleConfig,
  SlidePosition,
  TemplateStyleExtraction
} from '@shared/types/ppt-export'
import type {
  PptTemplateAnalysis,
  PptTemplateElementAnalysis,
  PptTemplateSlideAnalysis
} from '@shared/types/ppt-template'

/** EMU 到英寸的转换率 */
const EMU_PER_INCH = 914400

/**
 * 占位符类型映射
 */
const PLACEHOLDER_TYPE_MAP: Record<string, string> = {
  title: 'title',
  ctrTitle: 'title',
  subTitle: 'subtitle',
  body: 'content',
  content: 'content',
  txt: 'content',
  obj: 'content'
}

/**
 * 模板样式提取器
 * 负责从 PptTemplateAnalyzer 生成的分析结果中提取样式配置
 */
export class PptTemplateStyleExtractor {
  /**
   * 从 analysis.json 提取样式配置
   * @param analysis - 模板分析结果
   * @returns 提取的样式配置
   */
  extractFromAnalysis(analysis: PptTemplateAnalysis): PptStyleConfig {
    const config: PptStyleConfig = {}

    // 提取背景颜色
    config.backgroundColor = this.extractBackgroundColor(analysis.slides)

    // 推断主题颜色
    config.primaryColor = this.inferPrimaryColor(
      analysis.slides.flatMap(s => s.elements)
    )

    // 提取字体信息（从第一张幻灯片的文本元素）
    if (analysis.slides.length > 0) {
      const firstSlide = analysis.slides[0]
      const textElements = firstSlide.elements.filter(e => e.kind === 'text' || e.kind === 'placeholder')

      // 尝试从占位符提取字体信息
      for (const element of textElements) {
        if (element.placeholder?.type) {
          const type = element.placeholder.type.toLowerCase()
          if (type.includes('title') && !config.titleFont) {
            // 标题字体（暂不提取具体字体名，使用默认值）
            config.titleFont = 'Microsoft YaHei'
            config.titleSize = 36
          } else if ((type.includes('body') || type.includes('content')) && !config.bodyFont) {
            config.bodyFont = 'Microsoft YaHei'
            config.bodySize = 18
          }
        }
      }
    }

    logger.debug('样式提取完成', 'main', { config })
    return config
  }

  /**
   * 提取背景颜色
   * 优先使用第一张幻灯片的背景
   * @param slides - 幻灯片分析数组
   * @returns 背景颜色（十六进制）或 undefined
   */
  extractBackgroundColor(slides: PptTemplateSlideAnalysis[]): string | undefined {
    if (slides.length === 0) {
      return undefined
    }

    // 优先使用第一张幻灯片的背景色
    const firstSlide = slides[0]
    if (firstSlide.background?.color) {
      return this.normalizeColor(firstSlide.background.color)
    }

    // 如果第一张没有背景色，尝试查找其他幻灯片
    for (const slide of slides) {
      if (slide.background?.color) {
        return this.normalizeColor(slide.background.color)
      }
    }

    return undefined
  }

  /**
   * 提取占位符位置
   * 返回标题和内容区域的位置信息（转换为英寸）
   * @param slide - 幻灯片分析结果
   * @returns 标题和内容的占位符位置
   */
  extractPlaceholderPositions(
    slide: PptTemplateSlideAnalysis
  ): { title?: SlidePosition; content?: SlidePosition } {
    const titleCandidates: PptTemplateElementAnalysis[] = []
    const contentCandidates: PptTemplateElementAnalysis[] = []

    for (const element of slide.elements) {
      if (element.kind !== 'placeholder' || !element.placeholder?.type) {
        continue
      }

      const mappedType = this.mapPlaceholderType(element.placeholder.type.toLowerCase())
      if (mappedType === 'title') {
        titleCandidates.push(element)
      } else if (mappedType === 'content') {
        contentCandidates.push(element)
      }
    }

    const titleElement =
      this.selectTopMostElement(titleCandidates) ?? this.findFallbackTitleElement(slide.elements)

    let contentPosition: SlidePosition | undefined
    if (contentCandidates.length > 0) {
      contentPosition = this.mergeElementPositions(contentCandidates)
    } else {
      const fallbackContentElements = this.findFallbackContentElements(slide.elements, titleElement)
      if (fallbackContentElements.length > 0) {
        contentPosition = this.mergeElementPositions(fallbackContentElements)
      }
    }

    return {
      title: titleElement ? this.convertEmuPositionToInches(titleElement) : undefined,
      content: contentPosition
    }
  }

  /**
   * 将 EMU 单位转换为英寸
   * 1 英寸 = 914400 EMU
   * @param emu - EMU 单位值
   * @returns 英寸值
   */
  convertEmuToInches(emu: number): number {
    return emu / EMU_PER_INCH
  }

  /**
   * 提取幻灯片尺寸
   * @param analysis - 模板分析结果
   * @returns 幻灯片尺寸（英寸）
   */
  extractSlideSize(analysis: PptTemplateAnalysis): PptSlideSize | undefined {
    const { slideWidth, slideHeight } = analysis.presentation
    if (slideWidth <= 0 || slideHeight <= 0) {
      return undefined
    }

    return {
      width: this.convertEmuToInches(slideWidth),
      height: this.convertEmuToInches(slideHeight)
    }
  }

  /**
   * 将元素位置从 EMU 转换为英寸
   * @param element - 元素分析结果
   * @returns 英寸位置信息
   */
  private convertEmuPositionToInches(
    element: PptTemplateElementAnalysis
  ): SlidePosition {
    return {
      x: this.convertEmuToInches(element.x),
      y: this.convertEmuToInches(element.y),
      w: this.convertEmuToInches(element.cx),
      h: this.convertEmuToInches(element.cy)
    }
  }

  /**
   * 映射占位符类型到标准类型
   * @param type - 原始占位符类型
   * @returns 标准化类型
   */
  private mapPlaceholderType(type: string): string | undefined {
    const normalized = type.toLowerCase()

    for (const [key, value] of Object.entries(PLACEHOLDER_TYPE_MAP)) {
      if (normalized.includes(key)) {
        return value
      }
    }

    return undefined
  }

  /**
   * 选择最靠上的元素
   * @param elements - 元素数组
   * @returns 顶部元素
   */
  private selectTopMostElement(
    elements: PptTemplateElementAnalysis[]
  ): PptTemplateElementAnalysis | undefined {
    return [...elements].sort((left, right) => {
      if (left.y !== right.y) {
        return left.y - right.y
      }
      return left.x - right.x
    })[0]
  }

  /**
   * 合并多个元素的位置，得到整体内容区域
   * @param elements - 元素数组
   * @returns 合并后的位置
   */
  private mergeElementPositions(elements: PptTemplateElementAnalysis[]): SlidePosition | undefined {
    if (elements.length === 0) {
      return undefined
    }

    const minX = Math.min(...elements.map((element) => element.x))
    const minY = Math.min(...elements.map((element) => element.y))
    const maxRight = Math.max(...elements.map((element) => element.x + element.cx))
    const maxBottom = Math.max(...elements.map((element) => element.y + element.cy))

    return {
      x: this.convertEmuToInches(minX),
      y: this.convertEmuToInches(minY),
      w: this.convertEmuToInches(maxRight - minX),
      h: this.convertEmuToInches(maxBottom - minY)
    }
  }

  /**
   * 当模板未标记 title 占位符时，尝试从上方文本元素推断标题区域
   * @param elements - 全部元素
   * @returns 标题元素
   */
  private findFallbackTitleElement(
    elements: PptTemplateElementAnalysis[]
  ): PptTemplateElementAnalysis | undefined {
    const textElements = elements.filter((element) => {
      return (element.kind === 'text' || element.kind === 'placeholder') && !!element.text?.plainText
    })

    return this.selectTopMostElement(textElements)
  }

  /**
   * 当模板没有标准正文占位符时，尝试从文本区域和表格区域推断内容区域
   * @param elements - 全部元素
   * @param titleElement - 已识别的标题元素
   * @returns 内容元素数组
   */
  private findFallbackContentElements(
    elements: PptTemplateElementAnalysis[],
    titleElement?: PptTemplateElementAnalysis
  ): PptTemplateElementAnalysis[] {
    const titleBottom = titleElement ? titleElement.y + titleElement.cy : 0

    return elements
      .filter((element) => {
        if (!['text', 'placeholder', 'table', 'chart', 'image'].includes(element.kind)) {
          return false
        }

        if (element === titleElement) {
          return false
        }

        // 优先保留标题下方的大块区域，避免把页眉、页脚误认为正文区
        return element.y >= titleBottom || element.cy >= titleBottom - element.y
      })
      .sort((left, right) => (right.cx * right.cy) - (left.cx * left.cy))
      .slice(0, 4)
  }

  /**
   * 推断主题颜色
   * 从形状填充色或文本颜色推断
   * @param elements - 元素分析数组
   * @returns 推断的主题颜色（十六进制）或 undefined
   */
  inferPrimaryColor(elements: PptTemplateElementAnalysis[]): string | undefined {
    // 统计颜色出现频率
    const colorCounts = new Map<string, number>()

    for (const element of elements) {
      // 优先使用形状填充色
      if (element.shape?.fillColor) {
        const color = this.normalizeColor(element.shape.fillColor)
        if (color && this.isStrongColor(color)) {
          colorCounts.set(color, (colorCounts.get(color) || 0) + 2) // 形状颜色权重更高
        }
      }

      // 其次使用形状边框色
      if (element.shape?.strokeColor) {
        const color = this.normalizeColor(element.shape.strokeColor)
        if (color && this.isStrongColor(color)) {
          colorCounts.set(color, (colorCounts.get(color) || 0) + 1)
        }
      }
    }

    // 找出出现频率最高的颜色
    let maxCount = 0
    let primaryColor: string | undefined

    for (const [color, count] of colorCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        primaryColor = color
      }
    }

    return primaryColor
  }

  /**
   * 标准化颜色格式
   * 移除 # 前缀，确保大写
   * @param color - 原始颜色值
   * @returns 标准化的颜色值
   */
  private normalizeColor(color: string): string {
    if (!color) {
      return ''
    }

    // 移除 # 前缀
    let normalized = color.replace(/^#/, '')

    // 转换为大写
    normalized = normalized.toUpperCase()

    // 验证是否为有效的十六进制颜色
    if (/^[0-9A-F]{6}$/.test(normalized)) {
      return normalized
    }

    // 处理 3 位缩写（如 F00 -> FF0000）
    if (/^[0-9A-F]{3}$/.test(normalized)) {
      return normalized
        .split('')
        .map(c => c + c)
        .join('')
    }

    return ''
  }

  /**
   * 判断是否为"强色"（适合作为主题色）
   * 排除白色、黑色、灰色等弱色
   * @param color - 十六进制颜色值
   * @returns 是否为强色
   */
  private isStrongColor(color: string): boolean {
    const hex = color.replace(/^#/, '')

    if (hex.length !== 6) {
      return false
    }

    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)

    // 排除接近白色的颜色
    if (r > 230 && g > 230 && b > 230) {
      return false
    }

    // 排除接近黑色的颜色
    if (r < 30 && g < 30 && b < 30) {
      return false
    }

    // 排除灰色（RGB 值接近）
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max - min < 30) {
      return false
    }

    return true
  }

  /**
   * 完整的样式提取
   * @param analysis - 模板分析结果
   * @returns 完整的样式提取结果
   */
  extract(analysis: PptTemplateAnalysis): TemplateStyleExtraction {
    try {
      const style = this.extractFromAnalysis(analysis)
      const slideSize = this.extractSlideSize(analysis)
      const layouts = analysis.slides.map((slide) => ({
        name: slide.layoutName || `Slide ${slide.slideIndex + 1}`,
        backgroundColor: slide.background?.color ? this.normalizeColor(slide.background.color) : undefined,
        titlePosition: this.extractPlaceholderPositions(slide).title,
        contentPosition: this.extractPlaceholderPositions(slide).content
      }))

      return {
        success: true,
        style,
        layouts,
        slideSize
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('样式提取失败', 'main', { error: errorMessage })
      return {
        success: false,
        error: errorMessage
      }
    }
  }
}
