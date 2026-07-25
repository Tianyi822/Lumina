/**
 * 文件内容读取器
 * 从各种文件格式中提取文本内容，供知识库索引和文件预览使用
 */
import { existsSync, readFileSync, readFile } from 'fs'
import { extname } from 'path'

import mammoth from 'mammoth'
import officeParser, { type OfficeParserConfig } from 'officeparser'
import WordExtractor from 'word-extractor'
import { logger } from '@main/services/logger'
import { SUPPORTED_DOCUMENT_EXTENSIONS } from '@shared/constants/document'
import type { FilePreviewData } from '@shared/types/knowledge'

interface PdfjsTextContentItem {
  str?: string
}

interface PdfjsTextContent {
  items: PdfjsTextContentItem[]
}

interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>
}

interface PdfjsDocument {
  numPages: number
  getPage(pageNumber: number): Promise<PdfjsPage>
}

interface PdfjsLoadingTask {
  promise: Promise<PdfjsDocument>
}

interface PdfjsModule {
  VerbosityLevel?: {
    ERRORS: number
  }
  setVerbosityLevel?: (level: number) => void
  getDocument: (src: { data: Uint8Array; verbosity?: number }) => PdfjsLoadingTask
}

// 支持的文件类型
const SUPPORTED_FILE_TYPES = new Set<string>(SUPPORTED_DOCUMENT_EXTENSIONS)

/**
 * 读取文本文件内容（UTF-8 编码）
 */
async function readTextFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * 读取 PDF 文件内容
 * 使用 pdfjs-dist 逐页提取文本
 */
async function readPdfFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 PDF 文件', 'main', { filePath })
    const dataBuffer = readFileSync(filePath)
    logger.info('PDF 文件已读取', 'main', { size: dataBuffer.length })

    // 使用 pdfjs-dist 解析 PDF
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs') as PdfjsModule
    const verbosity = pdfjsLib.VerbosityLevel?.ERRORS

    if (typeof verbosity === 'number' && typeof pdfjsLib.setVerbosityLevel === 'function') {
      pdfjsLib.setVerbosityLevel(verbosity)
    }

    const loadingTask =
      typeof verbosity === 'number'
        ? pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer), verbosity })
        : pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) })

    const pdf = await loadingTask.promise
    logger.info('PDF 文档已加载', 'main', { pages: pdf.numPages })

    let fullText = ''

    // 逐页遍历 PDF，提取每页文本并拼接
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ')
      fullText += pageText + '\n'
    }

    logger.info('PDF 解析完成', 'main', { textLength: fullText.length })
    return fullText
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('PDF 解析失败', 'main', { filePath, error: errorMessage })
    throw new Error(`PDF 解析失败: ${errorMessage}`)
  }
}

/**
 * 读取 DOCX 文件内容（Office Open XML 格式）
 * 使用 mammoth 库提取纯文本
 */
async function readDocxFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 docx 文件', 'main', { filePath })
    const result = await mammoth.extractRawText({ path: filePath })
    logger.info('docx 解析完成', 'main', { textLength: result.value.length })
    return result.value
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('docx 解析失败', 'main', { filePath, error: errorMessage })
    throw new Error(`docx 解析失败: ${errorMessage}`)
  }
}

/**
 * 读取 DOC 文件内容（旧版 Word 二进制格式）
 * 使用 word-extractor 库提取文本
 */
async function readDocFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 doc 文件', 'main', { filePath })
    const extractor = new WordExtractor()
    const doc = await extractor.extract(filePath)
    const text = doc.getText()
    logger.info('doc 解析完成', 'main', { textLength: text.length })
    return text
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('doc 解析失败', 'main', { filePath, error: errorMessage })
    throw new Error(`doc 解析失败: ${errorMessage}`)
  }
}

/**
 * 读取 Excel 文件内容
 * 使用 officeparser 解析，仅提取文本部分
 */
async function readExcelFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 excel 文件', 'main', { filePath })
    const config: OfficeParserConfig = {
      newlineDelimiter: '\n',
      outputErrorToConsole: false
    }
    const ast = await officeParser.parseOffice(filePath, config)
    const fullText = ast.toText()
    logger.info('excel 解析完成', 'main', { textLength: fullText.length })
    return fullText
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('excel 解析失败', 'main', { filePath, error: errorMessage })
    throw new Error(`excel 解析失败: ${errorMessage}`)
  }
}

/**
 * 读取 PPTX 文件内容
 * 使用 officeparser 提取每张幻灯片的文本
 */
async function readPptxFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 pptx 文件', 'main', { filePath })
    const config: OfficeParserConfig = {
      newlineDelimiter: '\n',
      outputErrorToConsole: false,
      ignoreNotes: true,
      putNotesAtLast: true
    }
    const ast = await officeParser.parseOffice(filePath, config)
    const fullText = ast.toText()
    logger.info('pptx 解析完成', 'main', { textLength: fullText.length })
    return fullText
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('pptx 解析失败', 'main', { filePath, error: errorMessage })
    throw new Error(`pptx 解析失败: ${errorMessage}`)
  }
}

// 根据文件类型读取文件内容
export async function readFileContent(filePath: string, fileName: string): Promise<string> {
  const ext = extname(fileName).toLowerCase()

  if (ext === '.pdf') {
    return readPdfFile(filePath)
  }

  if (ext === '.docx') {
    return readDocxFile(filePath)
  }

  if (ext === '.doc') {
    return readDocFile(filePath)
  }

  if (ext === '.xls' || ext === '.xlsx') {
    return readExcelFile(filePath)
  }

  if (ext === '.pptx') {
    return readPptxFile(filePath)
  }

    // 未知扩展名作为纯文本文件读取
  return readTextFile(filePath)
}

// 预览内容最大长度（约 50 万字符）
const MAX_PREVIEW_CONTENT_LENGTH = 500_000

export function createFilePreviewDataFromContent(
  content: string,
  fileName: string,
  fileSize: number,
  uploadedAt: string,
  fileType: string
): { success: boolean; data?: FilePreviewData; error?: string } {
  const isTruncated = content.length > MAX_PREVIEW_CONTENT_LENGTH
  const displayContent = isTruncated
    ? content.slice(0, MAX_PREVIEW_CONTENT_LENGTH) + '\n\n... [内容过长，已截断显示]'
    : content

  return {
    success: true,
    data: {
      content: displayContent,
      fileName,
      fileType,
      fileSize,
      uploadedAt,
      isTruncated
    }
  }
}

// 读取文件预览数据
export async function readFilePreviewData(
  filePath: string,
  fileName: string,
  fileSize: number,
  uploadedAt: string,
  fileType: string
): Promise<{ success: boolean; data?: FilePreviewData; error?: string }> {
  try {
    const ext = extname(fileName).toLowerCase()
    if (!SUPPORTED_FILE_TYPES.has(ext)) {
      return { success: false, error: `不支持的文件类型: ${ext}` }
    }

    if (!existsSync(filePath)) {
      return { success: false, error: '文件不存在，可能已被删除' }
    }

    const content = await readFileContent(filePath, fileName)
    return createFilePreviewDataFromContent(content, fileName, fileSize, uploadedAt, fileType)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `文件读取失败: ${errorMessage}` }
  }
}
