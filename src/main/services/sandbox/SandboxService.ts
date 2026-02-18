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
import {
  SandboxData,
  SandboxListItem,
  SandboxResult,
  SandboxLogEntry,
  CreateSandboxRequest,
  CreateSandboxResult,
  DeleteSandboxOptions,
  SandboxContainerStatus,
  ContainerState
} from '@main/types/sandbox'
import {
  getSandboxDirPath,
  getMetadataFilePath,
  getOperationLogPath,
  isValidSandboxId,
  isPathInSandboxDir,
  generateSandboxId,
  sanitizeFileName
} from './sandboxPaths'

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
   * 列出所有沙箱（包含容器实时状态）
   */
  async listSandboxs(): Promise<SandboxListItem[]> {
    try {
      const sandboxDir = getSandboxDirPath()
      if (!existsSync(sandboxDir)) {
        return []
      }

      const dirs = readdirSync(sandboxDir, { withFileTypes: true })
      const sandboxs: SandboxListItem[] = []

      // 导入 DockerService
      const { getDockerService } = await import('./DockerService')
      const dockerService = await getDockerService()

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
            // 获取容器的实时状态
            let realTimeStatus = sandbox.status
            const containerId = sandbox.primaryContainerId || sandbox.containerIds?.[0]
            if (containerId) {
              try {
                const containers = await dockerService.listContainers({ state: 'all' })
                const container = containers.find((c) => c.id === containerId)
                if (container) {
                  // 映射容器状态到沙箱状态
                  if (container.state === 'running') {
                    realTimeStatus = 'running'
                  } else {
                    realTimeStatus = 'stopped'
                  }
                } else {
                  // 容器不存在，标记为孤儿
                  realTimeStatus = 'stopped'
                }
              } catch {
                // 获取容器状态失败，使用元数据中的状态
              }
            }

            sandboxs.push({
              sandboxId: sandbox.sandboxId,
              name: sandbox.name,
              status: realTimeStatus,
              createdAt: sandbox.createdAt,
              updatedAt: sandbox.updatedAt,
              creationType: sandbox.creationType,
              containerCount: sandbox.containerIds.length,
              isOrphan: sandbox.isOrphan
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

  // ==================== 沙箱管理 ====================

  /**
   * 创建沙箱（带类型指定）
   * 支持三种创建类型：existing、compose、dockerfile
   */
  async createSandbox(request: CreateSandboxRequest): Promise<CreateSandboxResult> {
    try {
      // 验证请求参数
      if (!request.name || request.name.trim() === '') {
        return { success: false, error: '沙箱名称不能为空' }
      }

      // 根据 creationType 验证必需参数
      if (request.creationType === 'existing' && !request.existingContainerId) {
        return { success: false, error: 'existing 类型需要提供容器 ID' }
      }
      // 注意：compose 和 dockerfile 类型的 configId 是可选的
      // 用户可以直接输入内容而不保存配置，实际的 Docker 操作在 IPC 处理器中完成

      // 导入 DockerService（延迟导入避免循环依赖）
      const { getDockerService } = await import('./DockerService')
      const dockerService = getDockerService()

      const sandboxId = generateSandboxId()
      const now = new Date().toISOString()

      const sandbox: SandboxData = {
        sandboxId,
        name: sanitizeFileName(request.name) || '未命名沙箱',
        description: request.description,
        status: 'creating',
        createdAt: now,
        updatedAt: now,
        creationType: request.creationType,
        containerIds: [],
        isOrphan: false
      }

      // 根据创建类型处理
      let containerIds: string[] = []

      switch (request.creationType) {
        case 'existing': {
          // 关联已有容器
          const containerId = request.existingContainerId!
          const containers = await dockerService.listContainers()
          const container = containers.find((c) => c.id === containerId)

          if (!container) {
            return { success: false, error: '指定的容器不存在' }
          }

          containerIds = [containerId]
          sandbox.containerIds = [containerId]
          sandbox.primaryContainerId = containerId
          sandbox.status = container.state === 'running' ? 'running' : 'stopped'
          break
        }

        case 'compose': {
          // 这里只创建元数据，实际容器启动由其他流程处理
          sandbox.composeProjectName =
            request.projectName || `sandbox-${sandboxId.substring(4, 12)}`
          sandbox.composeFilePath = request.composeConfigId
          sandbox.status = 'stopped'
          break
        }

        case 'dockerfile': {
          // 这里只创建元数据，实际容器启动由其他流程处理
          sandbox.dockerfileConfigId = request.dockerfileConfigId
          sandbox.status = 'stopped'
          break
        }
      }

      // 保存沙箱元数据
      this.ensureSandboxBoxDir(sandboxId)
      const saveResult = this.saveSandbox(sandbox)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '保存沙箱失败' }
      }

      this.logOperation(sandboxId, `沙箱创建成功 (类型: ${request.creationType})`, 'info')

      logger.info('沙箱创建成功', 'main', {
        sandboxId,
        name: sandbox.name,
        creationType: request.creationType
      })

      return {
        success: true,
        sandbox,
        containerIds
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建沙箱失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除沙箱（带选项）
   * 根据沙箱类型和选项执行不同的删除策略
   */
  async deleteSandbox(
    sandboxId: string,
    options?: DeleteSandboxOptions
  ): Promise<{ success: boolean; removedContainers?: string[]; error?: string }> {
    try {
      if (!isValidSandboxId(sandboxId)) {
        return { success: false, error: '无效的沙箱 ID' }
      }

      // 加载沙箱元数据
      const sandbox = this.loadSandbox(sandboxId)
      if (!sandbox) {
        return { success: false, error: '沙箱不存在' }
      }

      const removedContainers: string[] = []
      const deleteContainers = options?.deleteContainers
      const force = options?.force || false

      // 导入 DockerService
      const { getDockerService } = await import('./DockerService')
      const dockerService = getDockerService()

      // 根据创建类型决定删除策略
      switch (sandbox.creationType) {
        case 'existing': {
          // existing 类型：如果 deleteContainers 为 true，则删除容器
          if (deleteContainers && sandbox.containerIds.length > 0) {
            for (const containerId of sandbox.containerIds) {
              try {
                const result = await dockerService.removeContainer(containerId, force)
                if (result.success) {
                  removedContainers.push(containerId)
                  this.logOperation(sandboxId, `删除容器: ${containerId.substring(0, 12)}`, 'info')
                }
              } catch (error) {
                logger.warn('删除容器失败', 'main', {
                  containerId: containerId.substring(0, 12),
                  error: error instanceof Error ? error.message : String(error)
                })
              }
            }
          }
          break
        }

        case 'compose': {
          // compose 类型：如果 deleteContainers 为 true，执行 docker-compose down
          if (deleteContainers && sandbox.composeProjectName) {
            // TODO: 执行 docker-compose down
            // 这里需要调用 Docker Compose CLI
            // 暂时只删除元数据中记录的容器
            if (sandbox.containerIds.length > 0) {
              for (const containerId of sandbox.containerIds) {
                try {
                  const result = await dockerService.removeContainer(containerId, force)
                  if (result.success) {
                    removedContainers.push(containerId)
                    this.logOperation(
                      sandboxId,
                      `删除容器: ${containerId.substring(0, 12)}`,
                      'info'
                    )
                  }
                } catch (error) {
                  logger.warn('删除容器失败', 'main', {
                    containerId: containerId.substring(0, 12),
                    error: error instanceof Error ? error.message : String(error)
                  })
                }
              }
            }
          }
          break
        }

        case 'dockerfile': {
          // dockerfile 类型：如果 deleteContainers 为 true，删除关联容器
          if (deleteContainers && sandbox.containerIds.length > 0) {
            for (const containerId of sandbox.containerIds) {
              try {
                const result = await dockerService.removeContainer(containerId, force)
                if (result.success) {
                  removedContainers.push(containerId)
                  this.logOperation(sandboxId, `删除容器: ${containerId.substring(0, 12)}`, 'info')
                }
              } catch (error) {
                logger.warn('删除容器失败', 'main', {
                  containerId: containerId.substring(0, 12),
                  error: error instanceof Error ? error.message : String(error)
                })
              }
            }
          }
          break
        }
      }

      // 删除沙箱元数据目录
      const boxPath = getSandboxDirPath() + '/' + sandboxId
      if (isPathInSandboxDir(boxPath) && existsSync(boxPath)) {
        rmSync(boxPath, { recursive: true, force: true })
      }

      logger.info('沙箱删除成功', 'main', {
        sandboxId,
        removedContainers: removedContainers.length
      })

      return {
        success: true,
        removedContainers
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除沙箱失败', 'main', { error: errorMessage, sandboxId })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 检查沙箱关联的容器状态
   */
  async checkContainerStatus(sandboxId: string): Promise<SandboxContainerStatus | null> {
    try {
      if (!isValidSandboxId(sandboxId)) {
        logger.warn('无效的沙箱 ID', 'main', { sandboxId })
        return null
      }

      const sandbox = this.loadSandbox(sandboxId)
      if (!sandbox) {
        return null
      }

      // 导入 DockerService
      const { getDockerService } = await import('./DockerService')
      const dockerService = getDockerService()

      // 获取所有容器列表
      const containers = await dockerService.listContainers()
      const containerMap = new Map(containers.map((c) => [c.id, c]))

      const containerStates: Array<{
        containerId: string
        exists: boolean
        state?: ContainerState
        status: 'running' | 'stopped' | 'not_found'
      }> = []

      let isOrphan = false

      for (const containerId of sandbox.containerIds) {
        const container = containerMap.get(containerId)
        const exists = !!container

        if (!exists) {
          isOrphan = true
        }

        containerStates.push({
          containerId,
          exists,
          state: container?.state,
          status: container?.state === 'running' ? 'running' : container ? 'stopped' : 'not_found'
        })
      }

      const result: SandboxContainerStatus = {
        sandboxId,
        creationType: sandbox.creationType,
        containerIds: sandbox.containerIds,
        isOrphan,
        containerStates,
        checkedAt: new Date().toISOString()
      }

      // 如果是孤儿沙箱，更新元数据
      if (isOrphan && !sandbox.isOrphan) {
        sandbox.isOrphan = true
        sandbox.status = 'error'
        this.saveSandbox(sandbox)
        this.logOperation(sandboxId, '检测到容器丢失，标记为孤儿沙箱', 'warn')
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('检查容器状态失败', 'main', { error: errorMessage, sandboxId })
      return null
    }
  }

  /**
   * 批量检查所有沙箱的容器状态
   */
  async checkAllSandboxContainerStatus(): Promise<SandboxContainerStatus[]> {
    try {
      const sandboxes = await this.listSandboxs()
      const results: SandboxContainerStatus[] = []

      for (const sandbox of sandboxes) {
        const status = await this.checkContainerStatus(sandbox.sandboxId)
        if (status) {
          results.push(status)
        }
      }

      return results
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('批量检查容器状态失败', 'main', { error: errorMessage })
      return []
    }
  }

  /**
   * 清理孤儿沙箱
   * 删除容器已丢失的沙箱元数据
   */
  async cleanupOrphanSandbox(sandboxId: string): Promise<SandboxResult> {
    try {
      if (!isValidSandboxId(sandboxId)) {
        return { success: false, error: '无效的沙箱 ID' }
      }

      const sandbox = this.loadSandbox(sandboxId)
      if (!sandbox) {
        return { success: false, error: '沙箱不存在' }
      }

      // 检查是否为孤儿沙箱
      const status = await this.checkContainerStatus(sandboxId)
      if (!status || !status.isOrphan) {
        return { success: false, error: '该沙箱不是孤儿沙箱' }
      }

      // 删除元数据
      const boxPath = getSandboxDirPath() + '/' + sandboxId
      if (isPathInSandboxDir(boxPath) && existsSync(boxPath)) {
        rmSync(boxPath, { recursive: true, force: true })
      }

      logger.info('孤儿沙箱清理成功', 'main', { sandboxId })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('清理孤儿沙箱失败', 'main', { error: errorMessage, sandboxId })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 恢复孤儿沙箱
   * 将丢失的容器替换为新容器
   */
  async recoverOrphanSandbox(sandboxId: string, newContainerId: string): Promise<SandboxResult> {
    try {
      if (!isValidSandboxId(sandboxId)) {
        return { success: false, error: '无效的沙箱 ID' }
      }

      const sandbox = this.loadSandbox(sandboxId)
      if (!sandbox) {
        return { success: false, error: '沙箱不存在' }
      }

      // 导入 DockerService
      const { getDockerService } = await import('./DockerService')
      const dockerService = getDockerService()

      // 验证新容器是否存在
      const containers = await dockerService.listContainers()
      const newContainer = containers.find((c) => c.id === newContainerId)
      if (!newContainer) {
        return { success: false, error: '新容器不存在' }
      }

      // 更新沙箱元数据
      sandbox.containerIds = [newContainerId]
      sandbox.primaryContainerId = newContainerId
      sandbox.isOrphan = false
      sandbox.status = newContainer.state === 'running' ? 'running' : 'stopped'
      sandbox.updatedAt = new Date().toISOString()

      const saveResult = this.saveSandbox(sandbox)
      if (!saveResult.success) {
        return { success: false, error: '保存沙箱失败' }
      }

      this.logOperation(
        sandboxId,
        `孤儿沙箱恢复成功，新容器: ${newContainerId.substring(0, 12)}`,
        'info'
      )

      logger.info('孤儿沙箱恢复成功', 'main', {
        sandboxId,
        newContainerId: newContainerId.substring(0, 12)
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('恢复孤儿沙箱失败', 'main', { error: errorMessage, sandboxId })
      return { success: false, error: errorMessage }
    }
  }
}

/** 沙箱服务单例 */
export const sandboxService = new SandboxService()
