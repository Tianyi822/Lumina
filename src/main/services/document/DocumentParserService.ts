import { extname } from 'path'
import { writeFileSync, unlinkSync, existsSync, mkdtempSync, readFileSync, rmdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { logger } from '@main/services/logger'
import mammoth from 'mammoth'
import officeParser from 'officeparser'

/**
 * 文档解析服务
 * 负责解析各种格式的文档内容
 * 所有文件都是临时处理，不保存到持久化存储
 */
export class DocumentParserService {
  /**
   * 解析文档内容
   * @param fileData 文件数据（Buffer）
   * @param fileName 文件名
   * @returns 解析后的文本内容
   */
  async parseDocument(fileData: Buffer, fileName: string): Promise<string> {
    const ext = extname(fileName).toLowerCase()
    const tempDir = mkdtempSync(join(tmpdir(), 'sparrow-doc-'))
    const tempPath = join(tempDir, fileName)

    try {
      // 写入临时文件
      writeFileSync(tempPath, fileData)
      logger.info('开始解析文档', 'main', { fileName, size: fileData.length })

      let content: string

      switch (ext) {
        case '.txt':
        case '.md':
        case '.csv':
          content = this.parseTextFile(fileData)
          break

        case '.pdf':
          content = await this.parsePdf(tempPath)
          break

        case '.docx':
          content = await this.parseDocx(tempPath)
          break

        case '.doc':
          content = await this.parseDoc(tempPath)
          break

        case '.xls':
        case '.xlsx':
          content = await this.parseExcel(tempPath)
          break

        default:
          throw new Error(`不支持的文件类型: ${ext}`)
      }

      logger.info('文档解析完成', 'main', { fileName, contentLength: content.length })
      return content
    } finally {
      // 清理临时文件
      this.cleanupTempDir(tempDir, tempPath)
    }
  }

  /**
   * 解析文本文件（txt, md, csv）
   */
  private parseTextFile(fileData: Buffer): string {
    return fileData.toString('utf-8')
  }

  /**
   * 解析 PDF 文件
   */
  private async parsePdf(filePath: string): Promise<string> {
    try {
      logger.info('开始解析 PDF 文件', 'main', { filePath })
      const dataBuffer = readFileSync(filePath)
      logger.info('PDF 文件已读取', 'main', { size: dataBuffer.length })

      // 使用 pdfjs-dist 解析 PDF
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs')

      // 禁用 worker（在 Electron 主进程中不需要）
      pdfjsLib.GlobalWorkerOptions.disableWorker = true

      // 设置日志级别为 ERROR，抑制字体解析警告
      pdfjsLib.verbosity = pdfjsLib.VerbosityLevel.ERRORS

      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(dataBuffer),
        verbosity: pdfjsLib.VerbosityLevel.ERRORS
      }).promise
      logger.info('PDF 文档已加载', 'main', { pages: pdf.numPages })

      let fullText = ''

      // 遍历所有页面提取文本
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: { str: string }) => item.str).join(' ')
        fullText += pageText + '\n'
      }

      return fullText
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('PDF 解析失败', 'main', { filePath, error: errorMessage })
      throw new Error(`PDF 解析失败: ${errorMessage}`)
    }
  }

  /**
   * 解析 DOCX 文档（Office Open XML 格式）
   */
  private async parseDocx(filePath: string): Promise<string> {
    try {
      logger.info('开始解析 DOCX 文档', 'main', { filePath })

      const result = await mammoth.extractRawText({ path: filePath })

      logger.info('DOCX 文档解析完成', 'main', {
        filePath,
        contentLength: result.value.length,
        warnings: result.messages.length
      })

      if (result.messages.length > 0) {
        logger.warn('DOCX 解析警告', 'main', {
          filePath,
          warnings: result.messages
        })
      }

      return result.value
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('DOCX 文档解析失败', 'main', { filePath, error: errorMessage })
      throw new Error(`DOCX 文档解析失败: ${errorMessage}`)
    }
  }

  /**
   * 解析 DOC 文档（旧版二进制格式）
   */
  private async parseDoc(filePath: string): Promise<string> {
    try {
      logger.info('开始解析 DOC 文档', 'main', { filePath })

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WordExtractor = require('word-extractor')
      const extractor = new WordExtractor()
      const extracted = await extractor.extract(filePath)
      const text = extracted.getBody()

      logger.info('DOC 文档解析完成', 'main', {
        filePath,
        contentLength: text.length
      })

      return text
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('DOC 文档解析失败', 'main', { filePath, error: errorMessage })
      throw new Error(`DOC 文档解析失败: ${errorMessage}`)
    }
  }

  /**
   * 解析 Excel 电子表格
   * 提取单元格文本、工作表名称信息
   */
  private async parseExcel(filePath: string): Promise<string> {
    try {
      logger.info('开始解析 Excel 电子表格', 'main', { filePath })

      const config = {
        newlineDelimiter: '\n',
        outputErrorToConsole: false
      }

      const ast = await officeParser.parseOffice(filePath, config)
      const fullText = ast.toText()

      logger.info('Excel 解析完成', 'main', {
        filePath,
        contentLength: fullText.length,
        sheetCount: ast.content?.length || 0
      })

      return fullText
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Excel 解析失败', 'main', {
        filePath,
        error: errorMessage
      })

      if (errorMessage.includes('Invalid Excel')) {
        throw new Error('Excel 文件格式无效或已损坏')
      } else {
        throw new Error(`Excel 解析失败: ${errorMessage}`)
      }
    }
  }

  /**
   * 清理临时文件和目录
   */
  private cleanupTempDir(tempDir: string, tempPath: string): void {
    try {
      // 删除临时文件
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
      // 删除临时目录
      if (existsSync(tempDir)) {
        rmdirSync(tempDir)
      }
      logger.info('临时文件已清理', 'main', { tempDir })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('清理临时文件失败', 'main', { tempDir, error: errorMessage })
    }
  }
}

// ==================== 单例实例 ====================
let documentParserServiceInstance: DocumentParserService | null = null

/**
 * 获取文档解析服务单例
 */
export function getDocumentParserService(): DocumentParserService {
  if (!documentParserServiceInstance) {
    documentParserServiceInstance = new DocumentParserService()
  }
  return documentParserServiceInstance
}
