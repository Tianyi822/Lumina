import type {
  PresentationDecorativeShape,
  PresentationLayoutRegions,
  PresentationPageSize,
  PresentationSlideStyle,
  PresentationTemplateLayoutSpec,
  PresentationThemeConfig,
  PositionOptions,
  SlideLayout,
  TextStyle
} from '@shared/types/presentation'

interface ExtractedTemplateStyle {
  theme: PresentationThemeConfig
  previewColors: string[]
  previewImageDataUrl?: string
  pageSize?: PresentationPageSize
  layoutSpec?: PresentationTemplateLayoutSpec
}

interface ThemeColorPalette {
  lt1?: string
  lt2?: string
  dk1?: string
  dk2?: string
  accent1?: string
  accent2?: string
  accent3?: string
  accent4?: string
  accent5?: string
  accent6?: string
  hlink?: string
  folHlink?: string
}

interface ParsedTemplatePlaceholder {
  type: string
  position?: PositionOptions
  textStyle?: TextStyle
}

interface ParsedTemplateCandidate {
  name?: string
  source: 'master' | 'layout' | 'slide'
  backgroundColor?: string
  title?: ParsedTemplatePlaceholder
  subtitle?: ParsedTemplatePlaceholder
  bodyPlaceholders: ParsedTemplatePlaceholder[]
  pageNumber?: ParsedTemplatePlaceholder
  decorativeShapes: PresentationDecorativeShape[]
}

interface ZipReader {
  files: Record<string, unknown>
  file: (
    path: string
  ) => { async: (type: 'string' | 'uint8array') => Promise<string | Uint8Array> } | null
}

const DEFAULT_PAGE_SIZE: PresentationPageSize = {
  width: 13.33,
  height: 7.5
}

const EMU_PER_INCH = 914400
const EMU_PER_POINT = 12700
const MAX_DECORATIVE_SHAPES = 8

const COLOR_SLOT_ALIASES: Record<string, keyof ThemeColorPalette> = {
  bg1: 'lt1',
  bg2: 'lt2',
  tx1: 'dk1',
  tx2: 'dk2',
  lt1: 'lt1',
  lt2: 'lt2',
  dk1: 'dk1',
  dk2: 'dk2',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  accent5: 'accent5',
  accent6: 'accent6',
  hlink: 'hlink',
  folHlink: 'folHlink'
}

/**
 * PPT 模板提取器
 * 负责从导入的 PPT/POTX 中抽取主题、布局和排版信息
 */
export class PresentationTemplateExtractor {
  /**
   * 提取模板样式
   */
  async extract(fileData: Buffer): Promise<ExtractedTemplateStyle> {
    const { default: JSZip } = await import('jszip')
    const zip = (await JSZip.loadAsync(fileData)) as ZipReader
    const themeXml = await this.readFirstExistingText(zip, [
      'ppt/theme/theme1.xml',
      'ppt/theme/theme2.xml'
    ])
    const presentationXml = await this.readText(zip, 'ppt/presentation.xml')
    const pageSize = this.extractPageSize(presentationXml)
    const palette = this.extractThemePalette(themeXml)
    const theme = this.buildTheme(palette, themeXml)
    const layoutSpec = await this.extractLayoutSpec(zip, palette, pageSize)
    const previewImageDataUrl = await this.extractPreviewImageDataUrl(zip)

    return {
      theme,
      previewColors: [
        theme.primaryColor || '111827',
        theme.accentColor || theme.secondaryColor || 'E5E7EB',
        theme.backgroundColor || 'FFFFFF'
      ].map((color) => color.replace(/^#/, '').toUpperCase()),
      previewImageDataUrl,
      pageSize,
      layoutSpec
    }
  }

  /**
   * 提取主题色板
   */
  private extractThemePalette(themeXml: string | undefined): ThemeColorPalette {
    return {
      lt1: this.extractThemeColor(themeXml, 'lt1'),
      lt2: this.extractThemeColor(themeXml, 'lt2'),
      dk1: this.extractThemeColor(themeXml, 'dk1'),
      dk2: this.extractThemeColor(themeXml, 'dk2'),
      accent1: this.extractThemeColor(themeXml, 'accent1'),
      accent2: this.extractThemeColor(themeXml, 'accent2'),
      accent3: this.extractThemeColor(themeXml, 'accent3'),
      accent4: this.extractThemeColor(themeXml, 'accent4'),
      accent5: this.extractThemeColor(themeXml, 'accent5'),
      accent6: this.extractThemeColor(themeXml, 'accent6'),
      hlink: this.extractThemeColor(themeXml, 'hlink'),
      folHlink: this.extractThemeColor(themeXml, 'folHlink')
    }
  }

  /**
   * 构建主题配置
   */
  private buildTheme(
    palette: ThemeColorPalette,
    themeXml: string | undefined
  ): PresentationThemeConfig {
    const primaryColor = palette.accent1 || '2F6BFF'
    const secondaryColor = palette.accent2 || palette.lt2 || 'DCE7FF'
    const accentColor = palette.accent3 || secondaryColor
    const backgroundColor = palette.lt1 || 'FFFFFF'
    const textColor = palette.dk1 || '1F2937'
    const mutedTextColor = palette.dk2 || palette.accent4 || '6B7280'
    const headingFontFace = this.extractFontFace(themeXml, 'majorFont') || 'Aptos Display'
    const fontFace = this.extractFontFace(themeXml, 'minorFont') || headingFontFace || 'Aptos'

    return {
      primaryColor,
      secondaryColor,
      accentColor,
      backgroundColor,
      textColor,
      mutedTextColor,
      fontFace,
      headingFontFace
    }
  }

  /**
   * 提取布局规格
   */
  private async extractLayoutSpec(
    zip: ZipReader,
    palette: ThemeColorPalette,
    pageSize: PresentationPageSize | undefined
  ): Promise<PresentationTemplateLayoutSpec | undefined> {
    const effectivePageSize = pageSize || DEFAULT_PAGE_SIZE
    const [masterXmls, layoutXmls, slideXmls] = await Promise.all([
      this.readMatchingTexts(zip, /^ppt\/slideMasters\/slideMaster\d+\.xml$/i),
      this.readMatchingTexts(zip, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i),
      this.readMatchingTexts(zip, /^ppt\/slides\/slide\d+\.xml$/i)
    ])

    const masterCandidate = masterXmls
      .map((xml) => this.parseTemplateCandidate(xml, palette, effectivePageSize, 'master'))
      .find(Boolean)
    const candidates = [
      ...layoutXmls.map((xml) =>
        this.parseTemplateCandidate(xml, palette, effectivePageSize, 'layout')
      ),
      ...slideXmls.map((xml) =>
        this.parseTemplateCandidate(xml, palette, effectivePageSize, 'slide')
      )
    ]

    const layoutSpec: PresentationTemplateLayoutSpec = {
      regions: {},
      styles: {}
    }

    ;(['title', 'titleContent', 'twoColumn', 'comparison', 'blank'] as SlideLayout[]).forEach(
      (layout) => {
        const selectedCandidate =
          this.pickBestCandidate(candidates, layout) ||
          (layout === 'comparison' ? this.pickBestCandidate(candidates, 'twoColumn') : undefined)
        const mergedCandidate = this.mergeCandidate(masterCandidate, selectedCandidate)

        if (!mergedCandidate) {
          return
        }

        const regions = this.buildLayoutRegions(mergedCandidate, layout)
        if (regions) {
          layoutSpec.regions = layoutSpec.regions || {}
          layoutSpec.regions[layout] = regions
        }

        const slideStyle = this.buildSlideStyle(mergedCandidate)
        if (slideStyle) {
          layoutSpec.styles = layoutSpec.styles || {}
          layoutSpec.styles[layout] = slideStyle
        }
      }
    )

    if (
      (!layoutSpec.regions || Object.keys(layoutSpec.regions).length === 0) &&
      (!layoutSpec.styles || Object.keys(layoutSpec.styles).length === 0)
    ) {
      return undefined
    }

    return layoutSpec
  }

  /**
   * 解析模板页候选
   */
  private parseTemplateCandidate(
    xml: string,
    palette: ThemeColorPalette,
    pageSize: PresentationPageSize,
    source: ParsedTemplateCandidate['source']
  ): ParsedTemplateCandidate {
    const candidate: ParsedTemplateCandidate = {
      name: this.extractCandidateName(xml),
      source,
      backgroundColor: this.extractBackgroundColor(xml, palette),
      bodyPlaceholders: [],
      decorativeShapes: []
    }

    const blocks = [...this.extractBlocks(xml, 'p:sp'), ...this.extractBlocks(xml, 'p:cxnSp')]

    blocks.forEach((block) => {
      const placeholderType = this.extractPlaceholderType(block)
      const position = this.extractPosition(block)
      const textStyle = this.extractTextStyle(block, palette)

      if (placeholderType) {
        const placeholder: ParsedTemplatePlaceholder = {
          type: placeholderType,
          position,
          textStyle
        }

        switch (placeholderType) {
          case 'title':
          case 'ctrTitle':
            candidate.title = candidate.title || placeholder
            return
          case 'subTitle':
            candidate.subtitle = candidate.subtitle || placeholder
            return
          case 'sldNum':
            candidate.pageNumber = candidate.pageNumber || placeholder
            return
          case 'dt':
          case 'ftr':
            return
          default:
            candidate.bodyPlaceholders.push(placeholder)
            return
        }
      }

      const decorativeShape = this.extractDecorativeShape(block, palette)
      if (!decorativeShape) {
        return
      }

      if (
        !candidate.backgroundColor &&
        decorativeShape.fillColor &&
        this.isBackgroundShape(decorativeShape, pageSize)
      ) {
        candidate.backgroundColor = decorativeShape.fillColor
        return
      }

      candidate.decorativeShapes.push(decorativeShape)
    })

    candidate.bodyPlaceholders = this.sortPlaceholders(candidate.bodyPlaceholders)
    candidate.decorativeShapes = this.limitDecorativeShapes(
      this.deduplicateDecorativeShapes(candidate.decorativeShapes)
    )

    return candidate
  }

  /**
   * 选取最匹配的布局候选
   */
  private pickBestCandidate(
    candidates: ParsedTemplateCandidate[],
    layout: SlideLayout
  ): ParsedTemplateCandidate | undefined {
    let bestCandidate: ParsedTemplateCandidate | undefined
    let bestScore = Number.NEGATIVE_INFINITY

    candidates.forEach((candidate) => {
      const score = this.scoreCandidate(candidate, layout)
      if (score > bestScore) {
        bestScore = score
        bestCandidate = candidate
      }
    })

    return bestScore >= 12 ? bestCandidate : undefined
  }

  /**
   * 合并母版与布局候选
   */
  private mergeCandidate(
    masterCandidate: ParsedTemplateCandidate | undefined,
    selectedCandidate: ParsedTemplateCandidate | undefined
  ): ParsedTemplateCandidate | undefined {
    if (!masterCandidate && !selectedCandidate) {
      return undefined
    }

    if (!masterCandidate) {
      return selectedCandidate
    }

    if (!selectedCandidate) {
      return masterCandidate
    }

    return {
      name: selectedCandidate.name || masterCandidate.name,
      source: selectedCandidate.source,
      backgroundColor: selectedCandidate.backgroundColor || masterCandidate.backgroundColor,
      title: selectedCandidate.title || masterCandidate.title,
      subtitle: selectedCandidate.subtitle || masterCandidate.subtitle,
      bodyPlaceholders:
        selectedCandidate.bodyPlaceholders.length > 0
          ? selectedCandidate.bodyPlaceholders
          : masterCandidate.bodyPlaceholders,
      pageNumber: selectedCandidate.pageNumber || masterCandidate.pageNumber,
      decorativeShapes: this.deduplicateDecorativeShapes([
        ...masterCandidate.decorativeShapes,
        ...selectedCandidate.decorativeShapes
      ])
    }
  }

  /**
   * 构建布局区域
   */
  private buildLayoutRegions(
    candidate: ParsedTemplateCandidate,
    layout: SlideLayout
  ): PresentationLayoutRegions | undefined {
    const contentRegions = this.normalizeContentRegions(candidate.bodyPlaceholders, layout)

    if (
      !candidate.title?.position &&
      !candidate.subtitle?.position &&
      contentRegions.length === 0
    ) {
      return undefined
    }

    return {
      title: candidate.title?.position,
      subtitle: candidate.subtitle?.position,
      content: contentRegions
    }
  }

  /**
   * 构建单页样式
   */
  private buildSlideStyle(candidate: ParsedTemplateCandidate): PresentationSlideStyle | undefined {
    const bodyStyle = candidate.bodyPlaceholders[0]?.textStyle
    const pageNumber = candidate.pageNumber?.position
      ? {
          position: candidate.pageNumber.position,
          style: candidate.pageNumber.textStyle
        }
      : undefined

    const slideStyle: PresentationSlideStyle = {
      backgroundColor: candidate.backgroundColor,
      titleStyle: candidate.title?.textStyle,
      subtitleStyle: candidate.subtitle?.textStyle,
      bodyStyle,
      listStyle: bodyStyle,
      pageNumber,
      decorativeShapes:
        candidate.decorativeShapes.length > 0 ? candidate.decorativeShapes : undefined
    }

    if (
      !slideStyle.backgroundColor &&
      !slideStyle.titleStyle &&
      !slideStyle.subtitleStyle &&
      !slideStyle.bodyStyle &&
      !slideStyle.pageNumber &&
      !slideStyle.decorativeShapes?.length
    ) {
      return undefined
    }

    return slideStyle
  }

  /**
   * 候选评分
   */
  private scoreCandidate(candidate: ParsedTemplateCandidate, layout: SlideLayout): number {
    const hasTitle = !!candidate.title
    const hasSubtitle = !!candidate.subtitle
    const bodyCount = candidate.bodyPlaceholders.length
    const name = (candidate.name || '').toLowerCase()
    const sourceScore = candidate.source === 'layout' ? 8 : candidate.source === 'slide' ? 5 : 3

    let score = sourceScore

    switch (layout) {
      case 'title':
        if (hasTitle) {
          score += 24
        }
        if (hasSubtitle) {
          score += 18
        }
        if (bodyCount === 0) {
          score += 10
        } else if (bodyCount === 1) {
          score += 4
        }
        if (/(title|cover|封面|标题)/.test(name)) {
          score += 20
        }
        break
      case 'titleContent':
        if (hasTitle) {
          score += 20
        }
        if (bodyCount >= 1) {
          score += 20
        }
        if (bodyCount === 1) {
          score += 8
        }
        if (/(content|正文|内容|text)/.test(name)) {
          score += 12
        }
        break
      case 'twoColumn':
        if (hasTitle) {
          score += 16
        }
        if (bodyCount >= 2) {
          score += 24
        }
        if (/(two|comparison|compare|双栏|两栏|对比|比较)/.test(name)) {
          score += 18
        }
        break
      case 'comparison':
        if (hasTitle) {
          score += 16
        }
        if (bodyCount >= 2) {
          score += 22
        }
        if (/(comparison|compare|versus|对比|比较)/.test(name)) {
          score += 22
        }
        break
      case 'blank':
        if (!hasTitle) {
          score += 16
        }
        if (bodyCount >= 1) {
          score += 12
        }
        if (/(blank|空白)/.test(name)) {
          score += 20
        }
        break
    }

    return score
  }

  /**
   * 规范化内容区域
   */
  private normalizeContentRegions(
    placeholders: ParsedTemplatePlaceholder[],
    layout: SlideLayout
  ): PositionOptions[] {
    const positions = placeholders
      .map((item) => item.position)
      .filter((item): item is PositionOptions => !!item)
      .sort((left, right) => {
        const leftX = left.x || 0
        const rightX = right.x || 0

        if (Math.abs(leftX - rightX) > 0.2) {
          return leftX - rightX
        }

        return (left.y || 0) - (right.y || 0)
      })

    if (layout === 'twoColumn' || layout === 'comparison') {
      return positions.slice(0, 2)
    }

    return positions.slice(0, 1)
  }

  /**
   * 提取候选名称
   */
  private extractCandidateName(xml: string): string | undefined {
    const layoutType = xml.match(/<p:sldLayout[^>]*type="([^"]+)"/i)?.[1]
    const customName = xml.match(/<p:cSld[^>]*name="([^"]+)"/i)?.[1]

    return [layoutType, customName].filter(Boolean).join(' ').trim() || undefined
  }

  /**
   * 提取占位符类型
   */
  private extractPlaceholderType(block: string): string | undefined {
    const placeholderMatch = block.match(/<p:ph\b([^>]*)\/?>/i)
    if (!placeholderMatch) {
      return undefined
    }

    return placeholderMatch[1].match(/\btype="([^"]+)"/i)?.[1] || 'body'
  }

  /**
   * 提取元素位置
   */
  private extractPosition(block: string): PositionOptions | undefined {
    const offsetMatch = block.match(/<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/i)
    const extentMatch = block.match(/<a:ext[^>]*cx="(-?\d+)"[^>]*cy="(-?\d+)"/i)

    if (!offsetMatch || !extentMatch) {
      return undefined
    }

    return {
      x: this.round(Number(offsetMatch[1]) / EMU_PER_INCH),
      y: this.round(Number(offsetMatch[2]) / EMU_PER_INCH),
      w: this.round(Number(extentMatch[1]) / EMU_PER_INCH),
      h: this.round(Number(extentMatch[2]) / EMU_PER_INCH)
    }
  }

  /**
   * 提取文本样式
   */
  private extractTextStyle(block: string, palette: ThemeColorPalette): TextStyle | undefined {
    if (!block.includes('<a:txBody')) {
      return undefined
    }

    const styleSource =
      this.extractElementBlock(block, 'a:rPr') ||
      this.extractElementBlock(block, 'a:defRPr') ||
      this.extractElementBlock(block, 'a:endParaRPr')

    const paragraphBlock = this.extractElementBlock(block, 'a:p')
    const style: TextStyle = {}

    const sizeMatch = styleSource?.match(/\bsz="(\d+)"/i)
    if (sizeMatch) {
      style.fontSize = this.round(Number(sizeMatch[1]) / 100, 2)
    }

    if (styleSource?.match(/\bb="1"/i)) {
      style.bold = true
    }

    if (styleSource?.match(/\bi="1"/i)) {
      style.italic = true
    }

    const fontFace = this.extractTypeface(styleSource)
    if (fontFace) {
      style.fontFace = fontFace
    }

    const color = styleSource ? this.extractColorFromXml(styleSource, palette) : undefined
    if (color) {
      style.color = color
    }

    const align = paragraphBlock?.match(/<a:pPr[^>]*algn="([^"]+)"/i)?.[1]
    const normalizedAlign = this.normalizeAlign(align)
    if (normalizedAlign) {
      style.align = normalizedAlign
    }

    const anchor = block.match(/<a:bodyPr[^>]*anchor="([^"]+)"/i)?.[1]
    const normalizedValign = this.normalizeValign(anchor)
    if (normalizedValign) {
      style.valign = normalizedValign
    }

    if (
      style.fontSize === undefined &&
      style.bold === undefined &&
      style.italic === undefined &&
      !style.fontFace &&
      !style.color &&
      !style.align &&
      !style.valign
    ) {
      return undefined
    }

    return style
  }

  /**
   * 提取装饰图形
   */
  private extractDecorativeShape(
    block: string,
    palette: ThemeColorPalette
  ): PresentationDecorativeShape | undefined {
    if (block.includes('<a:txBody')) {
      return undefined
    }

    const position = this.extractPosition(block)
    if (!position?.x && position?.x !== 0) {
      return undefined
    }

    const shape = this.resolveDecorativeShapeType(block)
    if (!shape) {
      return undefined
    }

    const fillBlock = this.extractElementBlock(block, 'a:solidFill')
    const lineBlock = this.extractElementBlock(block, 'a:ln')

    return {
      shape,
      x: position.x || 0,
      y: position.y || 0,
      w: position.w || 0,
      h: position.h || 0,
      fillColor: fillBlock ? this.extractColorFromXml(fillBlock, palette) : undefined,
      lineColor: lineBlock ? this.extractColorFromXml(lineBlock, palette) : undefined,
      fillTransparency: fillBlock ? this.extractTransparency(fillBlock) : undefined,
      lineTransparency: lineBlock ? this.extractTransparency(lineBlock) : undefined,
      lineWidth: lineBlock ? this.extractLineWidth(lineBlock) : undefined
    }
  }

  /**
   * 解析装饰图形类型
   */
  private resolveDecorativeShapeType(
    block: string
  ): PresentationDecorativeShape['shape'] | undefined {
    if (block.startsWith('<p:cxnSp')) {
      return 'line'
    }

    const geometry = block.match(/<a:prstGeom[^>]*prst="([^"]+)"/i)?.[1]

    switch (geometry) {
      case 'rect':
      case 'roundRect':
      case 'ellipse':
      case 'chevron':
      case 'line':
      case 'arc':
        return geometry
      default:
        return undefined
    }
  }

  /**
   * 提取背景色
   */
  private extractBackgroundColor(xml: string, palette: ThemeColorPalette): string | undefined {
    const backgroundBlock =
      this.extractElementBlock(xml, 'p:bgPr') || this.extractElementBlock(xml, 'p:bg')

    return backgroundBlock ? this.extractColorFromXml(backgroundBlock, palette) : undefined
  }

  /**
   * 提取页面尺寸
   */
  private extractPageSize(xml: string | undefined): PresentationPageSize | undefined {
    if (!xml) {
      return undefined
    }

    const match = xml.match(/<[^>]*:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i)
    if (!match) {
      return undefined
    }

    const width = Number(match[1]) / EMU_PER_INCH
    const height = Number(match[2]) / EMU_PER_INCH

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined
    }

    return {
      width: this.round(width, 2),
      height: this.round(height, 2)
    }
  }

  /**
   * 解析主题颜色
   */
  private extractThemeColor(xml: string | undefined, tagName: string): string | undefined {
    if (!xml) {
      return undefined
    }

    const block = this.extractXmlBlock(xml, tagName)
    if (!block) {
      return undefined
    }

    const srgbMatch = block.match(/<[^>]*:srgbClr[^>]*val="([0-9A-Fa-f]{6})"/i)
    if (srgbMatch) {
      return srgbMatch[1].toUpperCase()
    }

    return block.match(/<[^>]*:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/i)?.[1]?.toUpperCase()
  }

  /**
   * 提取主题字体
   */
  private extractFontFace(xml: string | undefined, tagName: string): string | undefined {
    if (!xml) {
      return undefined
    }

    const block = this.extractXmlBlock(xml, tagName)
    return this.extractTypeface(block)
  }

  /**
   * 从 XML 中提取颜色
   */
  private extractColorFromXml(xml: string, palette: ThemeColorPalette): string | undefined {
    const srgbMatch = xml.match(/<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"/i)
    if (srgbMatch) {
      return srgbMatch[1].toUpperCase()
    }

    const sysMatch = xml.match(/<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/i)
    if (sysMatch) {
      return sysMatch[1].toUpperCase()
    }

    const schemeName = xml.match(/<a:schemeClr[^>]*val="([^"]+)"/i)?.[1]
    if (!schemeName) {
      return undefined
    }

    const slotName = COLOR_SLOT_ALIASES[schemeName]
    return slotName ? palette[slotName] : undefined
  }

  /**
   * 提取透明度
   */
  private extractTransparency(xml: string): number | undefined {
    const alphaMatch = xml.match(/<a:alpha[^>]*val="(\d+)"/i)
    if (!alphaMatch) {
      return undefined
    }

    return this.round(100 - Number(alphaMatch[1]) / 1000, 1)
  }

  /**
   * 提取线宽
   */
  private extractLineWidth(xml: string): number | undefined {
    const widthMatch = xml.match(/<a:ln[^>]*w="(\d+)"/i)
    if (!widthMatch) {
      return undefined
    }

    return this.round(Number(widthMatch[1]) / EMU_PER_POINT, 2)
  }

  /**
   * 提取字体名
   */
  private extractTypeface(xml: string | undefined): string | undefined {
    if (!xml) {
      return undefined
    }

    const candidates = [
      xml.match(/<a:latin[^>]*typeface="([^"]+)"/i)?.[1],
      xml.match(/<a:ea[^>]*typeface="([^"]+)"/i)?.[1],
      xml.match(/<a:cs[^>]*typeface="([^"]+)"/i)?.[1]
    ]

    return candidates.map((item) => item?.trim()).find((item) => !!item && !item.startsWith('+'))
  }

  /**
   * 提取文档自带缩略图
   */
  private async extractPreviewImageDataUrl(zip: ZipReader): Promise<string | undefined> {
    const previewEntries = Object.keys(zip.files)
      .filter((path) => /^docProps\/thumbnail\.(png|jpe?g)$/i.test(path))
      .sort()

    for (const entry of previewEntries) {
      const binary = await this.readBinary(zip, entry)
      if (!binary || binary.length === 0) {
        continue
      }

      const mimeType = /\.png$/i.test(entry) ? 'image/png' : 'image/jpeg'
      return `data:${mimeType};base64,${Buffer.from(binary).toString('base64')}`
    }

    return undefined
  }

  /**
   * 读取指定文本文件
   */
  private async readText(zip: ZipReader, path: string): Promise<string | undefined> {
    const file = zip.file(path)
    if (!file) {
      return undefined
    }

    const content = await file.async('string')
    return typeof content === 'string' ? content : undefined
  }

  /**
   * 读取指定二进制文件
   */
  private async readBinary(zip: ZipReader, path: string): Promise<Uint8Array | undefined> {
    const file = zip.file(path)
    if (!file) {
      return undefined
    }

    const content = await file.async('uint8array')
    return content instanceof Uint8Array ? content : undefined
  }

  /**
   * 读取首个存在的文本文件
   */
  private async readFirstExistingText(
    zip: ZipReader,
    paths: string[]
  ): Promise<string | undefined> {
    for (const path of paths) {
      const content = await this.readText(zip, path)
      if (content) {
        return content
      }
    }

    return undefined
  }

  /**
   * 按路径模式读取多个 XML
   */
  private async readMatchingTexts(zip: ZipReader, pattern: RegExp): Promise<string[]> {
    const paths = Object.keys(zip.files)
      .filter((path) => pattern.test(path))
      .sort((left, right) => this.extractArchiveIndex(left) - this.extractArchiveIndex(right))

    const result: string[] = []

    for (const path of paths) {
      const content = await this.readText(zip, path)
      if (content) {
        result.push(content)
      }
    }

    return result
  }

  /**
   * 提取 XML 节点块
   */
  private extractXmlBlock(xml: string, tagName: string): string | undefined {
    const escapedTag = this.escapeForRegex(tagName)
    const regex = new RegExp(`<[^>]*:${escapedTag}\\b[^>]*>([\\s\\S]*?)</[^>]*:${escapedTag}>`, 'i')

    return xml.match(regex)?.[1]
  }

  /**
   * 提取单个元素块
   */
  private extractElementBlock(xml: string, tagName: string): string | undefined {
    const escapedTag = this.escapeForRegex(tagName)
    const regex = new RegExp(`<${escapedTag}\\b[^>]*(?:/>|>[\\s\\S]*?</${escapedTag}>)`, 'i')

    return xml.match(regex)?.[0]
  }

  /**
   * 批量提取元素块
   */
  private extractBlocks(xml: string, tagName: string): string[] {
    const escapedTag = this.escapeForRegex(tagName)
    const regex = new RegExp(`<${escapedTag}\\b[\\s\\S]*?</${escapedTag}>`, 'gi')

    return Array.from(xml.matchAll(regex), (match) => match[0])
  }

  /**
   * 判断是否为背景图形
   */
  private isBackgroundShape(
    shape: PresentationDecorativeShape,
    pageSize: PresentationPageSize
  ): boolean {
    return (
      shape.x <= 0.1 &&
      shape.y <= 0.1 &&
      shape.w >= pageSize.width * 0.92 &&
      shape.h >= pageSize.height * 0.92
    )
  }

  /**
   * 限制装饰图形数量
   */
  private limitDecorativeShapes(
    shapes: PresentationDecorativeShape[]
  ): PresentationDecorativeShape[] {
    return [...shapes]
      .sort((left, right) => right.w * right.h - left.w * left.h)
      .slice(0, MAX_DECORATIVE_SHAPES)
  }

  /**
   * 去重装饰图形
   */
  private deduplicateDecorativeShapes(
    shapes: PresentationDecorativeShape[]
  ): PresentationDecorativeShape[] {
    const seen = new Set<string>()

    return shapes.filter((shape) => {
      const key = [
        shape.shape,
        shape.x,
        shape.y,
        shape.w,
        shape.h,
        shape.fillColor,
        shape.lineColor
      ].join(':')

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
  }

  /**
   * 排序占位符
   */
  private sortPlaceholders(placeholders: ParsedTemplatePlaceholder[]): ParsedTemplatePlaceholder[] {
    return [...placeholders].sort((left, right) => {
      const leftX = left.position?.x || 0
      const rightX = right.position?.x || 0

      if (Math.abs(leftX - rightX) > 0.2) {
        return leftX - rightX
      }

      return (left.position?.y || 0) - (right.position?.y || 0)
    })
  }

  /**
   * 归一化水平对齐
   */
  private normalizeAlign(value: string | undefined): TextStyle['align'] | undefined {
    switch (value) {
      case 'ctr':
        return 'center'
      case 'r':
        return 'right'
      case 'l':
      case 'just':
      case 'dist':
        return 'left'
      default:
        return undefined
    }
  }

  /**
   * 归一化垂直对齐
   */
  private normalizeValign(value: string | undefined): TextStyle['valign'] | undefined {
    switch (value) {
      case 'ctr':
        return 'middle'
      case 'b':
        return 'bottom'
      case 't':
      case 'just':
      case 'dist':
        return 'top'
      default:
        return undefined
    }
  }

  /**
   * 提取归档序号
   */
  private extractArchiveIndex(path: string): number {
    return Number(path.match(/(\d+)(?!.*\d)/)?.[1] || 0)
  }

  /**
   * 正则转义
   */
  private escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * 保留小数位
   */
  private round(value: number, fractionDigits: number = 3): number {
    return Number(value.toFixed(fractionDigits))
  }
}
