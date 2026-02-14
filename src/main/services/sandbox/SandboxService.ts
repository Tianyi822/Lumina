import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  appendFileSync
} from 'fs'
import { logger } from '@main/services/logger'
import { SandboxData, SandboxListItem, SandboxResult, SandboxLogEntry } from '@main/types/sandbox'
import {
  getSandboxDirPath,
  getMetadataFilePath,
  getOperationLogPath,
  isValidSandboxId,
  isPathInSandboxDir,
  generateSandboxId,
  sanitizeFileName
} from './sandboxPaths'

/** 默认沙箱名称 */
const DEFAULT_SANDBOX_NAME = '新沙箱'

/**
 * 沙箱服务
 * 负责沙箱的创建、保存、加载、删除和日志管理
 */
export class SandboxService {
  private initialized: boolean = false

  /**
   * 确保沙箱数据根目录存在
   */
  private ensureSandboxDir(): void {
    const sandboxDir = getSandboxDirPath()
    if (!existsSync(sandboxDir)) {
      mkdirSync(sandboxDir, { recursive: true })
      logger.info('沙箱数据目录创建成功', 'main', { path: sandboxDir })
    }
  }

  /**
   * 确保指定沙箱目录存在
   */
  private ensureSandboxBoxDir(sandboxId: string): void {
    const boxPath = getMetadataFilePath(sandboxId)
    const boxDir = boxPath.substring(0, boxPath.lastIndexOf('/'))
    if (!existsSync(boxDir)) {
      mkdirSync(boxDir, { recursive: true })
    }
  }

  /**
   * 初始化沙箱服务
   */
  initialize(): void {
    if (this.initialized) {
      return
    }

    try {
      this.ensureSandboxDir()
      this.initialized = true
      logger.info('沙箱服务初始化成功')
    } catch (error) {
      const errorMessage = `沙箱服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 创建新沙箱
   */
  createSandbox(name?: string): SandboxData {
    this.ensureSandboxDir()

    const sandboxId = generateSandboxId()
    const sandboxName = name || DEFAULT_SANDBOX_NAME
    const now = new Date().toISOString()

    const sandbox: SandboxData = {
      sandboxId,
      name: sandboxName,
      status: 'stopped',
      createdAt: now,
      updatedAt: now
    }

    this.ensureSandboxBoxDir(sandboxId)
    this.saveSandbox(sandbox)

    this.logOperation(sandboxId, `沙箱创建成功: ${sandboxName}`, 'info')

    logger.info('沙箱创建成功', 'main', { sandboxId, name: sandboxName })

    return sandbox
  }

  /**
   * 保存沙箱元数据
   */
  saveSandbox(data: SandboxData): SandboxResult {
    try {
      if (!isValidSandboxId(data.sandboxId)) {
        const error = '无效的沙箱 ID'
        logger.warn(error, 'main', { sandboxId: data.sandboxId })
        return { success: false, error }
      }

      this.ensureSandboxDir()
      this.ensureSandboxBoxDir(data.sandboxId)

      const filePath = getMetadataFilePath(data.sandboxId)

      if (!isPathInSandboxDir(filePath)) {
        const error = '不安全的文件路径'
        logger.warn(error, 'main', { filePath })
        return { success: false, error }
      }

      data.updatedAt = new Date().toISOString()

      const content = JSON.stringify(data, null, 2)
      writeFileSync(filePath, content, 'utf-8')

      logger.debug('沙箱保存成功', 'main', { sandboxId: data.sandboxId })
      return { success: true }
    } catch (error) {
      const errorMessage = `沙箱保存失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 加载沙箱
   */
  loadSandbox(sandboxId: string): SandboxData | null {
    try {
      if (!isValidSandboxId(sandboxId)) {
        logger.warn('无效的沙箱 ID', 'main', { sandboxId })
        return null
      }

      const filePath = getMetadataFilePath(sandboxId)

      if (!isPathInSandboxDir(filePath)) {
        logger.warn('不安全的文件路径', 'main', { filePath })
        return null
      }

      if (!existsSync(filePath)) {
        logger.debug('沙箱文件不存在', 'main', { sandboxId })
        return null
      }

      const content = readFileSync(filePath, 'utf-8')
      const sandbox = JSON.parse(content) as SandboxData

      logger.debug('沙箱加载成功', 'main', { sandboxId })
      return sandbox
    } catch (error) {
      const errorMessage = `沙箱加载失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return null
    }
  }

  /**
   * 列出所有沙箱
   */
  listSandboxs(): SandboxListItem[] {
    try {
      const sandboxDir = getSandboxDirPath()
      if (!existsSync(sandboxDir)) {
        return []
      }

      const dirs = readdirSync(sandboxDir, { withFileTypes: true })
      const sandboxs: SandboxListItem[] = []

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue
        }

        const sandboxId = dir.name
        if (!isValidSandboxId(sandboxId)) {
          continue
        }

        try {
          const sandbox = this.loadSandbox(sandboxId)
          if (sandbox) {
            sandboxs.push({
              sandboxId: sandbox.sandboxId,
              name: sandbox.name,
              status: sandbox.status,
              createdAt: sandbox.createdAt,
              updatedAt: sandbox.updatedAt
            })
          }
        } catch {
          logger.warn('无法解析沙箱', 'main', { sandboxId })
        }
      }

      sandboxs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return sandboxs
    } catch (error) {
      const errorMessage = `获取沙箱列表失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return []
    }
  }

  /**
   * 删除沙箱
   */
  deleteSandbox(sandboxId: string): SandboxResult {
    try {
      if (!isValidSandboxId(sandboxId)) {
        return { success: false, error: '无效的沙箱 ID' }
      }

      const boxPath = getSandboxDirPath() + '/' + sandboxId

      if (!isPathInSandboxDir(boxPath)) {
        return { success: false, error: '不安全的路径' }
      }

      if (!existsSync(boxPath)) {
        return { success: false, error: '沙箱不存在' }
      }

      rmSync(boxPath, { recursive: true, force: true })

      logger.info('沙箱删除成功', 'main', { sandboxId })
      return { success: true }
    } catch (error) {
      const errorMessage = `沙箱删除失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 重命名沙箱
   */
  renameSandbox(sandboxId: string, newName: string): SandboxResult {
    try {
      const sandbox = this.loadSandbox(sandboxId)
      if (!sandbox) {
        return { success: false, error: '沙箱不存在' }
      }

      sandbox.name = sanitizeFileName(newName) || sandbox.name

      const result = this.saveSandbox(sandbox)
      if (result.success) {
        this.logOperation(sandboxId, `沙箱重命名为: ${sandbox.name}`, 'info')
      }

      return result
    } catch (error) {
      const errorMessage = `沙箱重命名失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 写入操作日志（同时写入主日志）
   */
  logOperation(
    sandboxId: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    try {
      if (!isValidSandboxId(sandboxId)) {
        logger.warn('无效的沙箱 ID，无法写入日志', 'main', { sandboxId })
        return
      }

      this.ensureSandboxBoxDir(sandboxId)

      const logPath = getOperationLogPath(sandboxId)

      if (!isPathInSandboxDir(logPath)) {
        logger.warn('不安全的日志路径', 'main', { logPath })
        return
      }

      const timestamp = new Date().toISOString()
      const logEntry: SandboxLogEntry = {
        timestamp,
        level,
        message
      }

      const logLine = JSON.stringify(logEntry) + '\n'
      appendFileSync(logPath, logLine, 'utf-8')

      logger[level](`[沙箱:${sandboxId}] ${message}`, 'main')
    } catch (error) {
      logger.error(`写入沙箱日志失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 读取操作日志
   */
  readOperationLog(sandboxId: string): SandboxLogEntry[] {
    try {
      if (!isValidSandboxId(sandboxId)) {
        logger.warn('无效的沙箱 ID', 'main', { sandboxId })
        return []
      }

      const logPath = getOperationLogPath(sandboxId)

      if (!isPathInSandboxDir(logPath)) {
        logger.warn('不安全的日志路径', 'main', { logPath })
        return []
      }

      if (!existsSync(logPath)) {
        return []
      }

      const content = readFileSync(logPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      return lines.map((line) => JSON.parse(line) as SandboxLogEntry)
    } catch (error) {
      logger.error(`读取沙箱日志失败: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }
}

/** 沙箱服务单例 */
export const sandboxService = new SandboxService()
