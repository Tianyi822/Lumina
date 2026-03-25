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
  DeleteSandboxResult,
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
import { sandboxPermissionService } from './SandboxPermissionService'

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
  saveSandbox(data: SandboxData, options?: { silent?: boolean }): SandboxResult {
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

      if (!options?.silent) {
        logger.debug('沙箱保存成功', 'main', { sandboxId: data.sandboxId })
      }
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
  loadSandbox(sandboxId: string, options?: { silent?: boolean }): SandboxData | null {
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

      if (!options?.silent) {
        logger.debug('沙箱加载成功', 'main', { sandboxId })
      }
      return sandbox
    } catch (error) {
      const errorMessage = `沙箱加载失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return null
    }
  }

  /**
   * 加载所有沙箱元数据
   */
  loadAllSandboxes(): SandboxData[] {
    try {
      const sandboxDir = getSandboxDirPath()
      if (!existsSync(sandboxDir)) {
        return []
      }

      const dirs = readdirSync(sandboxDir, { withFileTypes: true })
      const sandboxes: SandboxData[] = []

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue
        }

        const sandboxId = dir.name
        if (!isValidSandboxId(sandboxId)) {
          continue
        }

        const sandbox = this.loadSandbox(sandboxId)
        if (sandbox) {
          sandboxes.push(sandbox)
        }
      }

      return sandboxes
    } catch (error) {
      logger.error('加载全部沙箱失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * 根据容器 ID 查找关联沙箱
   */
  findSandboxByContainerId(containerId: string): SandboxData | null {
    try {
      for (const sandbox of this.loadAllSandboxes()) {
        if (
          sandbox.primaryContainerId === containerId ||
          sandbox.containerIds.some((id) => id === containerId)
        ) {
          return sandbox
        }
      }

      return null
    } catch (error) {
      logger.error('根据容器 ID 查找沙箱失败', 'main', {
        containerId,
        error: error instanceof Error ? error.message : String(error)
      })
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
      const { getDockerService } = await import('./docker/DockerService')
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
      const { getDockerService } = await import('./docker/DockerService')
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
  ): Promise<DeleteSandboxResult> {
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
      const clearedContainerIds: string[] = []
      let removedWorkspace = false
      const force = options?.force || false

      // 导入 DockerService 和权限服务
      const { getDockerService } = await import('./docker/DockerService')
      const dockerService = getDockerService()

      // 使用权限服务验证删除选项
      const deletePolicy = sandboxPermissionService.validateDeleteOptions(
        sandbox.creationType,
        options?.deleteContainers
      )
      const shouldDeleteWorkspace = options?.deleteWorkspace === true
      const volumeName = sandbox.frontend?.volumeName
      const hasWorkspace = sandbox.frontend?.storageType === 'docker-volume' && !!volumeName

      if (shouldDeleteWorkspace && hasWorkspace && !deletePolicy.shouldDeleteContainers) {
        return {
          success: false,
          removedContainers,
          removedWorkspace: false,
          keptWorkspace: true,
          error: '删除前端工作区前必须同时删除关联容器'
        }
      }

      // 如果需要删除容器（且类型允许）
      const failedContainers: Array<{ id: string; reason: string }> = []

      if (deletePolicy.shouldDeleteContainers && sandbox.containerIds.length > 0) {
        for (const containerId of sandbox.containerIds) {
          try {
            // 先获取容器详情检查状态
            const containerDetails = await dockerService.getContainerDetails(containerId)
            const isRunning = containerDetails?.state === 'running'
            const containerName =
              containerDetails?.names?.[0]?.replace(/^\//, '') || containerId.substring(0, 12)

            // 如果容器正在运行，先停止它
            if (isRunning) {
              logger.info('容器正在运行，先停止容器', 'main', {
                containerId: containerId.substring(0, 12)
              })
              const stopResult = await dockerService.stopContainer(containerId, 10)
              if (!stopResult.success) {
                logger.warn('停止容器失败，将尝试强制删除', 'main', {
                  containerId: containerId.substring(0, 12),
                  error: stopResult.error
                })
              }
            }

            // 删除容器（如果停止失败或容器已停止，使用 force 强制删除）
            const result = await dockerService.removeContainer(containerId, force || isRunning)
            if (result.success) {
              removedContainers.push(containerId)
              clearedContainerIds.push(containerId)
              this.logOperation(sandboxId, `删除容器: ${containerId.substring(0, 12)}`, 'info')
            } else {
              // 分析删除失败原因
              let reason = result.error || '删除失败'
              if (
                result.error?.includes('HTTP code 409') ||
                result.error?.includes('container is running')
              ) {
                reason = `容器「${containerName}」正在运行，请先停止容器后再删除`
              } else if (
                result.error?.includes('HTTP code 404') ||
                result.error?.includes('No such container')
              ) {
                reason = `容器「${containerName}」不存在，可能已被手动删除`
                clearedContainerIds.push(containerId)
                this.logOperation(
                  sandboxId,
                  `关联容器已不存在，按已清理处理: ${containerId.substring(0, 12)}`,
                  'warn'
                )
              } else if (result.error?.includes('permission denied')) {
                reason = `权限不足，无法删除容器「${containerName}」`
              }

              if (!clearedContainerIds.includes(containerId)) {
                failedContainers.push({ id: containerId, reason })
                logger.warn('删除容器失败', 'main', {
                  containerId: containerId.substring(0, 12),
                  reason
                })
              }
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            let reason = '删除失败'
            if (errorMsg.includes('HTTP code 409') || errorMsg.includes('container is running')) {
              reason = '容器正在运行，请先停止容器后再删除'
            } else if (
              errorMsg.includes('HTTP code 404') ||
              errorMsg.includes('No such container')
            ) {
              reason = '容器不存在，可能已被手动删除'
              clearedContainerIds.push(containerId)
              this.logOperation(
                sandboxId,
                `关联容器已不存在，按已清理处理: ${containerId.substring(0, 12)}`,
                'warn'
              )
            }

            if (!clearedContainerIds.includes(containerId)) {
              failedContainers.push({ id: containerId, reason })
              logger.warn('删除容器失败', 'main', {
                containerId: containerId.substring(0, 12),
                error: errorMsg
              })
            }
          }
        }
      } else if (deletePolicy.warning) {
        // 记录警告信息（如 existing 类型强制保留容器）
        this.logOperation(sandboxId, deletePolicy.warning, 'warn')
        logger.info(deletePolicy.warning, 'main', {
          sandboxId,
          creationType: sandbox.creationType
        })
      }

      if (failedContainers.length > 0) {
        this.removeClearedContainersFromSandbox(sandbox, clearedContainerIds)

        sandbox.status = 'error'
        sandbox.updatedAt = new Date().toISOString()
        this.saveSandbox(sandbox)

        logger.warn('部分容器删除失败，保留沙箱元数据以便后续处理', 'main', {
          sandboxId,
          failedCount: failedContainers.length,
          reasons: failedContainers.map((f) => f.reason)
        })

        return {
          success: false,
          removedContainers,
          removedWorkspace: false,
          keptWorkspace: hasWorkspace,
          error: failedContainers.map((f) => f.reason).join('; ')
        }
      }

      if (shouldDeleteWorkspace && hasWorkspace && volumeName) {
        const ownedBySandbox = await dockerService.isVolumeOwnedBySandbox(volumeName, sandboxId)
        if (!ownedBySandbox) {
          this.removeClearedContainersFromSandbox(sandbox, clearedContainerIds)

          sandbox.status = 'error'
          sandbox.updatedAt = new Date().toISOString()
          this.saveSandbox(sandbox)

          return {
            success: false,
            removedContainers,
            removedWorkspace: false,
            keptWorkspace: true,
            error: `工作区 volume 不属于当前沙箱: ${volumeName}`
          }
        }

        const removeWorkspaceResult = await dockerService.removeVolume(volumeName, { force })
        if (!removeWorkspaceResult.success) {
          this.removeClearedContainersFromSandbox(sandbox, clearedContainerIds)

          sandbox.status = 'error'
          sandbox.updatedAt = new Date().toISOString()
          this.saveSandbox(sandbox)

          return {
            success: false,
            removedContainers,
            removedWorkspace: false,
            keptWorkspace: true,
            error: removeWorkspaceResult.error || '删除前端工作区失败'
          }
        }

        removedWorkspace = true
        this.logOperation(sandboxId, `删除工作区: ${volumeName}`, 'info')
      }

      // 删除沙箱元数据目录
      const boxPath = getSandboxDirPath() + '/' + sandboxId
      if (isPathInSandboxDir(boxPath) && existsSync(boxPath)) {
        rmSync(boxPath, { recursive: true, force: true })
      }

      // 构建返回结果
      const keptCount = sandbox.containerIds.length - clearedContainerIds.length
      const success = keptCount === 0 || !deletePolicy.shouldDeleteContainers

      logger.info('沙箱删除完成', 'main', {
        sandboxId,
        creationType: sandbox.creationType,
        removedContainers: removedContainers.length,
        removedWorkspace,
        keptWorkspace: hasWorkspace && !removedWorkspace,
        keptContainers: keptCount,
        failedContainers: 0
      })

      return {
        success,
        removedContainers,
        removedWorkspace,
        keptWorkspace: hasWorkspace && !removedWorkspace
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
      const { getDockerService } = await import('./docker/DockerService')
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

      const deleteResult = await this.deleteSandbox(sandboxId, {
        deleteContainers: true,
        deleteWorkspace: false,
        force: true
      })

      if (!deleteResult.success) {
        return {
          success: false,
          error: deleteResult.error || '清理孤儿沙箱失败'
        }
      }

      logger.info('孤儿沙箱清理成功', 'main', {
        sandboxId,
        keptWorkspace: deleteResult.keptWorkspace
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('清理孤儿沙箱失败', 'main', { error: errorMessage, sandboxId })
      return { success: false, error: errorMessage }
    }
  }

  private removeClearedContainersFromSandbox(
    sandbox: SandboxData,
    clearedContainerIds: string[]
  ): void {
    if (clearedContainerIds.length === 0) {
      return
    }

    sandbox.containerIds = sandbox.containerIds.filter(
      (containerId) => !clearedContainerIds.includes(containerId)
    )

    if (sandbox.primaryContainerId && clearedContainerIds.includes(sandbox.primaryContainerId)) {
      sandbox.primaryContainerId = sandbox.containerIds[0]
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
      const { getDockerService } = await import('./docker/DockerService')
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
