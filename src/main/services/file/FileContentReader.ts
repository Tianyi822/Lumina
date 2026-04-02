/**
 * 文件内容读取器
 * 从各种文件格式中提取文本内容，供知识库索引和文件预览使用
 */
import { existsSync, readFileSync, readFile } from 'fs'
import { extname } from 'path'

import mammoth from 'mammoth'
import WordExtractor from 'word-extractor'
import officeParser from 'officeparser'
import { logger } from '@main/services/logger'
import type { FilePreviewData } from '@shared/types/knowledge'

// 支持的文件类型
export const SUPPORTED_FILE_TYPES = new Set([
  '.txt',
  '.md',
  '.pdf',
  '.doc',
  '.docx',
  '.csv',
  '.xls',
  '.xlsx',
  '.pptx'
])

// 读取文本文件内容
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

// 读取 PDF 文件内容
async function readPdfFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 PDF 文件', 'main', { filePath })
    const dataBuffer = readFileSync(filePath)
    logger.info('PDF 文件已读取', 'main', { size: dataBuffer.length })

    // 使用 pdfjs-dist 解析 PDF
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs')

    // 禁用 worker（在 Electron 主进程中不需要）
    pdfjsLib.GlobalWorkerOptions.disableWorker = true

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) }).promise
    logger.info('PDF 文档已加载', 'main', { pages: pdf.numPages })

    let fullText = ''

    // 遍历所有页面提取文本
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: { str: string }) => item.str).join(' ')
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

// 读取 docx 文件内容
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

// 读取 doc 文件内容
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

// 读取 pptx 文件内容（仅提取文本，忽略格式和动画）
async function readPptxFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 pptx 文件', 'main', { filePath })
    const config = {
      ignoreNotes: false,
      newlineDelimiter: '\n',
      outputErrorToConsole: false
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

// 读取 excel 文件内容（仅提取文本）
async function readExcelFile(filePath: string): Promise<string> {
  try {
    logger.info('开始解析 excel 文件', 'main', { filePath })
    const config = {
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

  if (ext === '.pptx') {
    return readPptxFile(filePath)
  }

  if (ext === '.xls' || ext === '.xlsx') {
    return readExcelFile(filePath)
  }

  // 其他类型作为文本文件读取
  return readTextFile(filePath)
}

// 预览内容最大长度（约 50 万字符）
const MAX_PREVIEW_CONTENT_LENGTH = 500_000

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `文件读取失败: ${errorMessage}` }
  }
}
