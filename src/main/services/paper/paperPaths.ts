import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { getConfigDirPath } from '@main/services/config/configPaths'

/**
 * 论文数据目录名称
 */
export const PAPERS_DIR_NAME = 'papers'

/**
 * 页面图片子目录名称
 */
export const PAGES_DIR_NAME = 'pages'

/**
 * OCR 原始结果子目录名称
 */
export const OCR_RAW_DIR_NAME = 'ocr/raw'

/**
 * OCR 归一化结果子目录名称
 */
export const OCR_NORMALIZED_DIR_NAME = 'ocr/normalized'

/**
 * 裁剪图片资源子目录名称
 */
export const ASSETS_DIR_NAME = 'assets'

/**
 * 论文元信息文件名
 */
export const META_FILE_NAME = 'meta.json'

/**
 * 合并后的 Markdown 文件名
 */
export const MERGED_MD_FILE_NAME = 'merged.md'

/**
 * 翻译缓存文件名
 */
export const TRANSLATION_FILE_NAME = 'translation.json'

/**
 * 批注文件名
 */
export const ANNOTATIONS_FILE_NAME = 'annotations.json'

/**
 * 原始 PDF 文件名
 */
export const SOURCE_PDF_FILE_NAME = 'source.pdf'

/**
 * 获取论文根目录路径
 */
export function getPapersDirPath(): string {
  return join(getConfigDirPath(), PAPERS_DIR_NAME)
}

/**
 * 获取指定论文的目录路径
 */
export function getPaperDirPath(paperId: string): string {
  return join(getPapersDirPath(), paperId)
}

/**
 * 获取论文元信息文件路径
 */
export function getPaperMetaPath(paperId: string): string {
  return join(getPaperDirPath(paperId), META_FILE_NAME)
}

/**
 * 获取论文原始 PDF 文件路径
 */
export function getPaperSourcePdfPath(paperId: string): string {
  return join(getPaperDirPath(paperId), SOURCE_PDF_FILE_NAME)
}

/**
 * 获取论文页面图片目录路径
 */
export function getPaperPagesDirPath(paperId: string): string {
  return join(getPaperDirPath(paperId), PAGES_DIR_NAME)
}

/**
 * 获取指定页图片文件路径
 */
export function getPaperPageImagePath(paperId: string, pageIndex: number): string {
  const paddedIndex = String(pageIndex + 1).padStart(4, '0')
  return join(getPaperPagesDirPath(paperId), `page-${paddedIndex}.jpg`)
}

/**
 * 获取 OCR 原始结果目录路径
 */
export function getPaperOcrRawDirPath(paperId: string): string {
  return join(getPaperDirPath(paperId), OCR_RAW_DIR_NAME)
}

/**
 * 获取 OCR 归一化结果目录路径
 */
export function getPaperOcrNormalizedDirPath(paperId: string): string {
  return join(getPaperDirPath(paperId), OCR_NORMALIZED_DIR_NAME)
}

/**
 * 获取指定页 OCR 原始结果文件路径
 */
export function getPaperOcrRawPath(paperId: string, pageIndex: number): string {
  const paddedIndex = String(pageIndex + 1).padStart(4, '0')
  return join(getPaperOcrRawDirPath(paperId), `page-${paddedIndex}.json`)
}

/**
 * 获取指定页 OCR 归一化结果文件路径
 */
export function getPaperOcrNormalizedPath(paperId: string, pageIndex: number): string {
  const paddedIndex = String(pageIndex + 1).padStart(4, '0')
  return join(getPaperOcrNormalizedDirPath(paperId), `page-${paddedIndex}.json`)
}

/**
 * 获取论文资源目录路径
 */
export function getPaperAssetsDirPath(paperId: string): string {
  return join(getPaperDirPath(paperId), ASSETS_DIR_NAME)
}

/**
 * 获取指定页资源目录路径
 */
export function getPaperPageAssetsDirPath(paperId: string, pageIndex: number): string {
  const paddedIndex = String(pageIndex + 1).padStart(4, '0')
  return join(getPaperAssetsDirPath(paperId), `page-${paddedIndex}`)
}

/**
 * 获取指定块的图片资源文件名
 */
export function getPaperFigureAssetFileName(blockIndex: number): string {
  const paddedBlockIndex = String(blockIndex).padStart(4, '0')
  return `crop-${paddedBlockIndex}.png`
}

/**
 * 获取指定块的图片资源相对路径
 */
export function getPaperFigureAssetRelativePath(pageIndex: number, blockIndex: number): string {
  const paddedPageIndex = String(pageIndex + 1).padStart(4, '0')
  return `assets/page-${paddedPageIndex}/${getPaperFigureAssetFileName(blockIndex)}`
}

/**
 * 获取指定块的图片资源绝对路径
 */
export function getPaperFigureAssetPath(
  paperId: string,
  pageIndex: number,
  blockIndex: number
): string {
  return join(
    getPaperPageAssetsDirPath(paperId, pageIndex),
    getPaperFigureAssetFileName(blockIndex)
  )
}

/**
 * 获取合并后的 Markdown 文件路径
 */
export function getPaperMergedMdPath(paperId: string): string {
  return join(getPaperDirPath(paperId), MERGED_MD_FILE_NAME)
}

/**
 * 获取翻译缓存文件路径
 */
export function getPaperTranslationPath(paperId: string): string {
  return join(getPaperDirPath(paperId), TRANSLATION_FILE_NAME)
}

/**
 * 获取批注文件路径
 */
export function getPaperAnnotationsPath(paperId: string): string {
  return join(getPaperDirPath(paperId), ANNOTATIONS_FILE_NAME)
}

/**
 * 确保论文目录结构存在
 */
export function ensurePaperDirs(paperId: string): void {
  const dirs = [
    getPaperDirPath(paperId),
    getPaperPagesDirPath(paperId),
    getPaperOcrRawDirPath(paperId),
    getPaperOcrNormalizedDirPath(paperId),
    getPaperAssetsDirPath(paperId)
  ]

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}
