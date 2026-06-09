import { dirname } from 'path'
import { appendFile, mkdir, readdir, readFile, writeFile, rm, access } from 'fs/promises'
import { constants } from 'fs'
import { logger } from '@main/services/logger'
import type {
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabResult
} from '@main/types/lab'
import {
  getLabDirPath,
  getLabInstancePath,
  getMetadataFilePath,
  getOperationLogPath,
  isValidLabId,
  isPathInLabDir,
  generateLabId,
  sanitizeFileName
} from './labPaths'

/**
 * 实验室服务
 * 负责实验室的创建、保存、加载、删除和日志管理
 */
export class LabService {
  private initialized: boolean = false

  /**
   * 确保实验室数据根目录存在
   */
  private async ensureLabDir(): Promise<void> {
    const labDir = getLabDirPath()
    try {
      await access(labDir, constants.F_OK)
    } catch {
      await mkdir(labDir, { recursive: true })
      logger.info('实验室数据目录创建成功', 'main', { path: labDir })
    }
  }

  /**
   * 确保指定实验室目录存在
   */
  private async ensureLabInstanceDir(labId: string): Promise<void> {
    const metadataPath = getMetadataFilePath(labId)
    const instanceDir = dirname(metadataPath)
    try {
      await access(instanceDir, constants.F_OK)
    } catch {
      await mkdir(instanceDir, { recursive: true })
    }
  }

  /**
   * 初始化实验室服务
   * 确保实验室数据目录存在，多次调用安全（幂等）
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await this.ensureLabDir()
      this.initialized = true
      logger.info('实验室服务初始化成功')
    } catch (error) {
      const errorMessage = `实验室服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 保存实验室元数据
   * @param data - 实验室数据对象
   * @param options.silent - 静默模式，为 true 时不写 debug 日志
   * @returns 保存结果
   */
  async saveLab(data: LabData, options?: { silent?: boolean }): Promise<LabResult> {
    try {
      if (!isValidLabId(data.labId)) {
        const error = '无效的实验室 ID'
        logger.warn(error, 'main', { labId: data.labId })
        return { success: false, error }
      }

      await this.ensureLabDir()
      await this.ensureLabInstanceDir(data.labId)

      const filePath = getMetadataFilePath(data.labId)

      if (!isPathInLabDir(filePath)) {
        const error = '不安全的文件路径'
        logger.warn(error, 'main', { filePath })
        return { success: false, error }
      }

      data.updatedAt = new Date().toISOString()

      const content = JSON.stringify(data, null, 2)
      await writeFile(filePath, content, 'utf-8')

      if (!options?.silent) {
        logger.debug('实验室保存成功', 'main', { labId: data.labId })
      }
      return { success: true }
    } catch (error) {
      const errorMessage = `实验室保存失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 加载实验室元数据
   * @param labId - 实验室 ID
   * @param options.silent - 静默模式
   * @returns 实验室数据，不存在或出错返回 null
   */
  async loadLab(labId: string, options?: { silent?: boolean }): Promise<LabData | null> {
    try {
      if (!isValidLabId(labId)) {
        logger.warn('无效的实验室 ID', 'main', { labId })
        return null
      }

      const filePath = getMetadataFilePath(labId)

      if (!isPathInLabDir(filePath)) {
        logger.warn('不安全的文件路径', 'main', { filePath })
        return null
      }

      const content = await readFile(filePath, 'utf-8').catch(() => null)
      if (content === null) {
        logger.debug('实验室文件不存在', 'main', { labId })
        return null
      }

      const lab = JSON.parse(content) as LabData

      // 类型降级：旧数据中的 Docker 类型统一修正为 ssh
      if (!lab.backendType || lab.backendType !== 'ssh') {
        lab.backendType = 'ssh'
      }
      if (!lab.creationType || lab.creationType !== 'ssh') {
        lab.creationType = 'ssh'
      }

      if (!options?.silent) {
        logger.debug('实验室加载成功', 'main', { labId })
      }
      return lab
    } catch (error) {
      const errorMessage = `实验室加载失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return null
    }
  }

  /**
   * 加载所有实验室元数据
   * @returns 实验室数据数组，异常时返回空数组
   */
  async loadAllLabs(): Promise<LabData[]> {
    try {
      const labDir = getLabDirPath()
      let dirs: import('fs').Dirent[]
      try {
        dirs = await readdir(labDir, { withFileTypes: true })
      } catch {
        return []
      }

      const labs: LabData[] = []

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue
        }

        const labId = dir.name
        if (!isValidLabId(labId)) {
          continue
        }

        const lab = await this.loadLab(labId)
        if (lab) {
          labs.push(lab)
        }
      }

      return labs
    } catch (error) {
      logger.error('加载全部实验室失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * 按主进程内存连接状态同步 SSH 实验室元数据
   * 将 SshConnectionManager 中的实时连接状态同步到硬盘上的 LabData
   * @param options.silent - 静默模式，默认 true 避免同步时反复写日志
   */
  async reconcileSshRuntimeState(lab: LabData, options?: { silent?: boolean }): Promise<LabData> {
    // 非 SSH 类型的实验室无需同步
    if (lab.backendType !== 'ssh' || !lab.ssh) {
      return lab
    }

    const { sshService: sshInstance } = await import('./ssh/SshService')
    const sshStatus = sshInstance.getConnectionStatus(lab.labId)
    // 将 SSH 连接状态映射为实验室状态
    const nextStatus =
      sshStatus === 'connected' ? 'running' : sshStatus === 'connecting' ? 'creating' : 'stopped'
    const nextConnected = sshStatus === 'connected'

    // 状态未变化则跳过写入
    if (lab.status === nextStatus && lab.ssh.connected === nextConnected) {
      return lab
    }

    lab.status = nextStatus
    lab.ssh.connected = nextConnected

    if (!nextConnected) {
      lab.ssh.connected = false
    }

    await this.saveLab(lab, { silent: options?.silent ?? true })
    return lab
  }

  /**
   * 列出所有实验室（按创建时间降序排列）
   * @returns 实验室列表，异常时返回空数组
   */
  async listLabs(): Promise<LabListItem[]> {
    try {
      const labDir = getLabDirPath()
      let dirs: import('fs').Dirent[]
      try {
        dirs = await readdir(labDir, { withFileTypes: true })
      } catch {
        return []
      }
      const labs: LabListItem[] = []

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue
        }

        const labId = dir.name
        if (!isValidLabId(labId)) {
          continue
        }

        try {
          const lab = await this.loadLab(labId)
          if (lab) {
            const resolvedLab = await this.reconcileSshRuntimeState(lab, { silent: true })
            labs.push({
              labId: resolvedLab.labId,
              name: resolvedLab.name,
              status: resolvedLab.status,
              createdAt: resolvedLab.createdAt,
              updatedAt: resolvedLab.updatedAt,
              creationType: resolvedLab.creationType
            })
          }
        } catch {
          logger.warn('无法解析实验室', 'main', { labId })
        }
      }

      // 按创建时间降序排列（最新的在前）
      labs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return labs
    } catch (error) {
      const errorMessage = `获取实验室列表失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return []
    }
  }

  /**
   * 重命名实验室
   * @param newName - 新名称（会自动清理非法字符）
   */
  async renameLab(labId: string, newName: string): Promise<LabResult> {
    try {
      const lab = await this.loadLab(labId)
      if (!lab) {
        return { success: false, error: '实验室不存在' }
      }

      lab.name = sanitizeFileName(newName) || lab.name

      const result = await this.saveLab(lab)
      if (result.success) {
        await this.logOperation(labId, `实验室重命名为: ${lab.name}`, 'info')
      }

      return result
    } catch (error) {
      const errorMessage = `实验室重命名失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 写入操作日志（同时写入主日志）
   * @param message - 日志消息
   * @param level - 日志级别
   */
  async logOperation(
    labId: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info'
  ): Promise<void> {
    try {
      if (!isValidLabId(labId)) {
        logger.warn('无效的实验室 ID，无法写入日志', 'main', { labId })
        return
      }

      await this.ensureLabInstanceDir(labId)

      const logPath = getOperationLogPath(labId)

      if (!isPathInLabDir(logPath)) {
        logger.warn('不安全的日志路径', 'main', { logPath })
        return
      }

      const timestamp = new Date().toISOString()
      const logEntry: LabLogEntry = {
        timestamp,
        level,
        message
      }

      const logLine = JSON.stringify(logEntry) + '\n'
      await appendFile(logPath, logLine, 'utf-8')

      logger[level](`[实验室:${labId}] ${message}`, 'main')
    } catch (error) {
      logger.error(`写入实验室日志失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 读取操作日志
   * @returns 日志条目数组，从 JSON 行反序列化
   */
  async readOperationLog(labId: string): Promise<LabLogEntry[]> {
    try {
      if (!isValidLabId(labId)) {
        logger.warn('无效的实验室 ID', 'main', { labId })
        return []
      }

      const logPath = getOperationLogPath(labId)

      if (!isPathInLabDir(logPath)) {
        logger.warn('不安全的日志路径', 'main', { logPath })
        return []
      }

      const content = await readFile(logPath, 'utf-8').catch(() => null)
      if (content === null) {
        return []
      }

      const lines = content.trim().split('\n').filter(Boolean)

      return lines.map((line) => JSON.parse(line) as LabLogEntry)
    } catch (error) {
      logger.error(`读取实验室日志失败: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  // ==================== 实验室管理 ====================

  /**
   * 创建 SSH 实验室
   * @param request - 创建实验室请求（名称、SSH 连接信息等）
   * @returns 创建结果及实验室数据
   */
  async createLab(request: CreateLabRequest): Promise<CreateLabResult> {
    try {
      // 校验必填参数
      if (!request.name || request.name.trim() === '') {
        return { success: false, error: '实验室名称不能为空' }
      }

      if (!request.sshHost) {
        return { success: false, error: 'SSH 实验室需要提供 sshHost' }
      }

      if (!request.sshUsername) {
        return { success: false, error: 'SSH 实验室需要提供 sshUsername' }
      }

      const labId = generateLabId()
      const now = new Date().toISOString()

      const lab: LabData = {
        labId,
        name: request.name.trim(),
        description: request.description,
        status: 'stopped',
        createdAt: now,
        updatedAt: now,
        creationType: 'ssh',
        containerIds: [],
        backendType: 'ssh',
        ssh: {
          host: request.sshHost,
          port: request.sshPort || 22,
          username: request.sshUsername,
          authType: request.sshAuthType || 'password',
          keyName: request.sshKeyName
        }
      }

      await this.ensureLabInstanceDir(labId)
      const saveResult = await this.saveLab(lab)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '保存实验室失败' }
      }

      await this.logOperation(labId, '实验室创建成功 (类型: ssh)', 'info')

      logger.info('实验室创建成功', 'main', {
        labId,
        name: lab.name,
        creationType: 'ssh'
      })

      return {
        success: true,
        lab
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建实验室失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除实验室（断开 SSH 连接并删除元数据目录）
   * @param labId - 待删除的实验室 ID
   * @returns 删除结果
   */
  async deleteLab(labId: string): Promise<DeleteLabResult> {
    try {
      if (!isValidLabId(labId)) {
        return { success: false, error: '无效的实验室 ID' }
      }

      const lab = await this.loadLab(labId)
      if (!lab) {
        return { success: false, error: '实验室不存在' }
      }

      // 先断开 SSH 连接，即使失败也继续清理元数据
      const { sshService: sshInstance } = await import('./ssh/SshService')
      const disconnectResult = await sshInstance.disconnect(labId)
      if (!disconnectResult.success) {
        logger.warn('SSH 断开连接失败，继续清理元数据', 'main', {
          labId,
          error: disconnectResult.error
        })
      }

      // 删除实验室目录
      const labPath = getLabInstancePath(labId)
      if (isPathInLabDir(labPath)) {
        try {
          await rm(labPath, { recursive: true, force: true })
        } catch {
          // 目录不存在时忽略
        }
      }

      await this.logOperation(labId, 'SSH 实验室已删除', 'info')

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除实验室失败', 'main', { error: errorMessage, labId })
      return { success: false, error: errorMessage }
    }
  }
}

/** 实验室服务单例 */
export const labService = new LabService()
