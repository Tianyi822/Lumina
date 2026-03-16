import { extname } from 'path'
import type { PptExportConfig, ParsedSlide, SlideStyle } from '@shared/types/ppt-export'
import type { PptTemplateSlideAnalysis } from '@shared/types/ppt-template'
import type { TemplateRenderBundle } from './types'

/**
 * 解析当前页面应复用的模板页
 * @param bundle - 模板渲染上下文
 * @param slide - 原始页面
 * @param generatedIndex - 当前生成顺序
 * @returns 模板页分析结果
 */
export function resolveTemplateSlide(
  bundle: TemplateRenderBundle | null,
  slide: ParsedSlide,
  generatedIndex: number
): PptTemplateSlideAnalysis | undefined {
  if (!bundle || bundle.analysis.slides.length === 0) {
    return undefined
  }

  // 如果页面带有索引且在模板范围内，直接使用对应的模板页
  if (slide.index >= 0 && slide.index < bundle.analysis.slides.length) {
    return bundle.analysis.slides[slide.index]
  }

  // 否则按顺序循环复用模板页
  return bundle.analysis.slides[generatedIndex % bundle.analysis.slides.length]
}

/**
 * 构建当前页面的最终样式
 * @param config - 导出配置
 * @param templateSlide - 模板页
 * @returns 最终样式
 */
export function buildSlideStyle(
  config: PptExportConfig,
  templateSlide?: PptTemplateSlideAnalysis
): SlideStyle | undefined {
  if (config.styleSource.type === 'template' && templateSlide) {
    return {
      backgroundColor: templateSlide.background?.color || config.style.backgroundColor
    }
  }

  return {
    backgroundColor: config.style.backgroundColor
  }
}

/**
 * 构建文件名
 * @param title - 文件标题
 * @returns 文件名
 */
export function buildFileName(title?: string): string {
  const baseTitle = title ? sanitizeFileName(title) : 'presentation'
  const timestamp = formatTimestamp()
  return `${baseTitle}_${timestamp}.pptx`
}

/**
 * 清洗文件名
 * @param name - 原始名称
 * @returns 清洗后的名称
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

/**
 * 格式化时间戳
 * @returns 格式化的时间戳
 */
export function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

/**
 * 解析媒体 MIME 类型
 * @param filePath - 文件路径
 * @returns MIME 类型
 */
export function resolveMediaMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()

  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

/**
 * 判断是否为仅包含表格的幻灯片
 * @param slide - 幻灯片数据
 * @returns 是否仅包含单个表格块
 */
export function isTableOnlySlide(slide: ParsedSlide): slide is ParsedSlide & {
  blocks: [{ type: 'table'; headers: string[]; rows: string[][] }]
} {
  return slide.blocks.length === 1 && slide.blocks[0].type === 'table'
}
