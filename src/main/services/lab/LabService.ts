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
import type {
  LabData,
  LabListItem,
  LabResult,
  LabLogEntry,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabResult,
  DeleteLabOptions,
  LabContainerStatus,
  ContainerState,
  ContainerInfo
} from '@main/types/lab'
import {
  getLabDirPath,
  getMetadataFilePath,
  getOperationLogPath,
  isValidLabId,
  isPathInLabDir,
  generateLabId,
  sanitizeFileName
} from './labPaths'
import { labPermissionService } from './LabPermissionService'

/**
 * 实验室服务
 * 负责实验室的创建、保存、加载、删除和日志管理
 */
export class LabService {
  private initialized: boolean = false

  /**
   * 确保实验室数据根目录存在
   */
  private ensureLabDir(): void {
    const labDir = getLabDirPath()
    if (!existsSync(labDir)) {
      mkdirSync(labDir, { recursive: true })
      logger.info('实验室数据目录创建成功', 'main', { path: labDir })
    }
  }

  /**
   * 确保指定实验室目录存在
   */
  private ensureLabInstanceDir(labId: string): void {
    const metadataPath = getMetadataFilePath(labId)
    const instanceDir = metadataPath.substring(0, metadataPath.lastIndexOf('/'))
    if (!existsSync(instanceDir)) {
      mkdirSync(instanceDir, { recursive: true })
    }
  }

  /**
   * 初始化实验室服务
   */
  initialize(): void {
    if (this.initialized) {
      return
    }

    try {
      this.ensureLabDir()
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
   */
  saveLab(data: LabData, options?: { silent?: boolean }): LabResult {
    try {
      if (!isValidLabId(data.labId)) {
        const error = '无效的实验室 ID'
        logger.warn(error, 'main', { labId: data.labId })
        return { success: false, error }
      }

      this.ensureLabDir()
      this.ensureLabInstanceDir(data.labId)

      const filePath = getMetadataFilePath(data.labId)

      if (!isPathInLabDir(filePath)) {
        const error = '不安全的文件路径'
        logger.warn(error, 'main', { filePath })
        return { success: false, error }
      }

      data.updatedAt = new Date().toISOString()

      const content = JSON.stringify(data, null, 2)
      writeFileSync(filePath, content, 'utf-8')

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
   * 加载实验室
   */
  loadLab(labId: string, options?: { silent?: boolean }): LabData | null {
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

      if (!existsSync(filePath)) {
        logger.debug('实验室文件不存在', 'main', { labId })
        return null
      }

      const content = readFileSync(filePath, 'utf-8')
      const lab = JSON.parse(content) as LabData
      if (!lab.backendType) {
        lab.backendType = 'docker'
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
   */
  loadAllLabs(): LabData[] {
    try {
      const labDir = getLabDirPath()
      if (!existsSync(labDir)) {
        return []
      }

      const dirs = readdirSync(labDir, { withFileTypes: true })
      const labs: LabData[] = []

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue
        }

        const labId = dir.name
        if (!isValidLabId(labId)) {
          continue
        }

        const lab = this.loadLab(labId)
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
   */
  async reconcileSshRuntimeState(
    lab: LabData,
    options?: { silent?: boolean }
  ): Promise<LabData> {
    if (lab.backendType !== 'ssh' || !lab.ssh) {
      return lab
    }

    const { sshService: sshInstance } = await import('./ssh/SshService')
    const sshStatus = sshInstance.getConnectionStatus(lab.labId)
    const nextStatus =
      sshStatus === 'connected' ? 'running' : sshStatus === 'connecting' ? 'creating' : 'stopped'
    const nextConnected = sshStatus === 'connected'

    if (lab.status === nextStatus && lab.ssh.connected === nextConnected) {
      return lab
    }

    lab.status = nextStatus
    lab.ssh.connected = nextConnected

    if (!nextConnected) {
      lab.ssh.connected = false
    }

    this.saveLab(lab, { silent: options?.silent ?? true })
    return lab
  }

  /**
   * 根据容器 ID 查找关联实验室
   */
  findLabByContainerId(containerId: string): LabData | null {
    try {
      for (const lab of this.loadAllLabs()) {
        if (
          lab.primaryContainerId === containerId ||
          lab.containerIds.some((id) => id === containerId)
        ) {
          return lab
        }
      }

      return null
    } catch (error) {
      logger.error('根据容器 ID 查找实验室失败', 'main', {
        containerId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * 列出所有实验室（包含容器实时状态）
   */
  async listLabs(): Promise<LabListItem[]> {
    try {
      const labDir = getLabDirPath()
      if (!existsSync(labDir)) {
        return []
      }

      const dirs = readdirSync(labDir, { withFileTypes: true })
      const labs: LabListItem[] = []

      // 导入 DockerService 并一次性获取所有容器（避免循环内重复调用）
      const { getDockerService } = await import('./docker/DockerService')
      const dockerService = await getDockerService()
      let allContainers: ContainerInfo[] = []
      try {
        allContainers = await dockerService.listContainers({ state: 'all' })
      } catch {
        // 获取容器列表失败，后续使用元数据中的状态
      }

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue
        }

        const labId = dir.name
        if (!isValidLabId(labId)) {
          continue
        }

        try {
          const lab = this.loadLab(labId)
          if (lab) {
            if (lab.backendType === 'ssh') {
              const resolvedLab = await this.reconcileSshRuntimeState(lab, { silent: true })
              labs.push({
                labId: resolvedLab.labId,
                name: resolvedLab.name,
                status: resolvedLab.status,
                createdAt: resolvedLab.createdAt,
                updatedAt: resolvedLab.updatedAt,
                creationType: resolvedLab.creationType,
                containerCount: 0,
                isOrphan: false
              })
              continue
            }

            // 获取容器的实时状态
            let realTimeStatus = lab.status
            let isOrphan = lab.isOrphan
            const containerId = lab.primaryContainerId || lab.containerIds?.[0]
            if (containerId) {
              try {
                const container = allContainers.find((c) => c.id === containerId)
                if (container) {
                  if (container.state === 'running') {
                    realTimeStatus = 'running'
                  } else {
                    realTimeStatus = 'stopped'
                  }
                  // 容器重新出现，清除孤儿标记
                  if (isOrphan) {
                    isOrphan = false
                    lab.isOrphan = false
                    this.saveLab(lab, { silent: true })
                  }
                } else {
                  // 容器在 Docker 中不存在，标记为孤儿并持久化
                  realTimeStatus = 'stopped'
                  if (!isOrphan) {
                    isOrphan = true
                    lab.isOrphan = true
                    lab.status = 'stopped'
                    this.saveLab(lab, { silent: true })
                  }
                }
              } catch {
                // 查找容器失败，使用元数据中的状态
              }
            }

            labs.push({
              labId: lab.labId,
              name: lab.name,
              status: realTimeStatus,
              createdAt: lab.createdAt,
              updatedAt: lab.updatedAt,
              creationType: lab.creationType,
              containerCount: lab.containerIds.length,
              isOrphan
            })
          }
        } catch {
          logger.warn('无法解析实验室', 'main', { labId })
        }
      }

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
   */
  renameLab(labId: string, newName: string): LabResult {
    try {
      const lab = this.loadLab(labId)
      if (!lab) {
        return { success: false, error: '实验室不存在' }
      }

      lab.name = sanitizeFileName(newName) || lab.name

      const result = this.saveLab(lab)
      if (result.success) {
        this.logOperation(labId, `实验室重命名为: ${lab.name}`, 'info')
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
   */
  logOperation(labId: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    try {
      if (!isValidLabId(labId)) {
        logger.warn('无效的实验室 ID，无法写入日志', 'main', { labId })
        return
      }

      this.ensureLabInstanceDir(labId)

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
      appendFileSync(logPath, logLine, 'utf-8')

      logger[level](`[实验室:${labId}] ${message}`, 'main')
    } catch (error) {
      logger.error(`写入实验室日志失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 读取操作日志
   */
  readOperationLog(labId: string): LabLogEntry[] {
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

      if (!existsSync(logPath)) {
        return []
      }

      const content = readFileSync(logPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      return lines.map((line) => JSON.parse(line) as LabLogEntry)
    } catch (error) {
      logger.error(`读取实验室日志失败: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  // ==================== 实验室管理 ====================

  /**
   * 创建实验室（带类型指定）
   * 支持三种创建类型：existing、compose、dockerfile
   */
  async createLab(request: CreateLabRequest): Promise<CreateLabResult> {
    try {
      // 验证请求参数
      if (!request.name || request.name.trim() === '') {
        return { success: false, error: '实验室名称不能为空' }
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

      const labId = generateLabId()
      const now = new Date().toISOString()

      const lab: LabData = {
        labId,
        name: sanitizeFileName(request.name) || '未命名实验室',
        description: request.description,
        status: 'creating',
        createdAt: now,
        updatedAt: now,
        creationType: request.creationType,
        containerIds: [],
        isOrphan: false,
        backendType: 'docker'
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
          lab.containerIds = [containerId]
          lab.primaryContainerId = containerId
          lab.status = container.state === 'running' ? 'running' : 'stopped'
          break
        }

        case 'compose': {
          // 这里只创建元数据，实际容器启动由其他流程处理
          lab.composeProjectName = request.projectName || `lab-${labId.substring(4, 12)}`
          lab.composeFilePath = request.composeConfigId
          lab.status = 'stopped'
          break
        }

        case 'dockerfile': {
          // 这里只创建元数据，实际容器启动由其他流程处理
          lab.dockerfileConfigId = request.dockerfileConfigId
          lab.status = 'stopped'
          break
        }

        case 'ssh': {
          // SSH 实验室：后端类型应为 'ssh'，不涉及任何容器操作
          if (!request.sshHost || !request.sshUsername) {
            return { success: false, error: 'SSH 实验室需要提供 sshHost 和 sshUsername' }
          }
          lab.backendType = 'ssh'
          lab.ssh = {
            host: request.sshHost,
            port: request.sshPort || 22,
            username: request.sshUsername,
            authType: request.sshAuthType || 'password',
            keyName: request.sshKeyName
          }
          lab.status = 'stopped'
          break
        }
      }

      // 保存实验室元数据
      this.ensureLabInstanceDir(labId)
      const saveResult = this.saveLab(lab)
      if (!saveResult.success) {
        return { success: false, error: saveResult.error || '保存实验室失败' }
      }

      this.logOperation(labId, `实验室创建成功 (类型: ${request.creationType})`, 'info')

      logger.info('实验室创建成功', 'main', {
        labId,
        name: lab.name,
        creationType: request.creationType
      })

      return {
        success: true,
        lab,
        containerIds
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建实验室失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除实验室（带选项）
   * 根据实验室类型和选项执行不同的删除策略
   */
  async deleteLab(labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> {
    try {
      if (!isValidLabId(labId)) {
        return { success: false, error: '无效的实验室 ID' }
      }

      // 加载实验室元数据
      const lab = this.loadLab(labId)
      if (!lab) {
        return { success: false, error: '实验室不存在' }
      }

      if (lab.backendType === 'ssh') {
        const { sshService: sshInstance } = await import('./ssh/SshService')
        const disconnectResult = await sshInstance.disconnect(labId)
        if (!disconnectResult.success) {
          logger.warn('SSH 断开连接失败，继续清理元数据', 'main', {
            labId,
            error: disconnectResult.error
          })
        }

        const labPath = getLabDirPath() + '/' + labId
        if (isPathInLabDir(labPath) && existsSync(labPath)) {
          rmSync(labPath, { recursive: true, force: true })
        }

        this.logOperation(labId, 'SSH 实验室已删除', 'info')
        return {
          success: true,
          removedContainers: [],
          removedWorkspace: false
        }
      }

      const removedContainers: string[] = []
      const clearedContainerIds = new Set<string>()
      let removedWorkspace = false
      const force = options?.force || false

      // 导入 DockerService 和权限服务
      const { getDockerService } = await import('./docker/DockerService')
      const dockerService = getDockerService()

      // 使用权限服务验证删除选项
      const deletePolicy = labPermissionService.validateDeleteOptions(
        lab.creationType,
        options?.deleteContainers
      )
      const shouldDeleteWorkspace = options?.deleteWorkspace === true
      const volumeName = lab.frontend?.volumeName
      const hasWorkspace = lab.frontend?.storageType === 'docker-volume' && !!volumeName

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

      if (deletePolicy.shouldDeleteContainers && lab.containerIds.length > 0) {
        const dockerAvailability = await dockerService.checkAvailable()
        if (!dockerAvailability.available) {
          return {
            success: false,
            removedContainers,
            removedWorkspace: false,
            keptWorkspace: hasWorkspace,
            error: `Docker 不可用，无法确认或删除关联容器: ${dockerAvailability.error || '未知错误'}`
          }
        }

        for (const containerId of lab.containerIds) {
          try {
            // 先获取容器详情检查状态
            const containerDetails = await dockerService.getContainerDetails(containerId)
            const containerName =
              containerDetails?.names?.[0]?.replace(/^\//, '') || containerId.substring(0, 12)

            if (!containerDetails) {
              clearedContainerIds.add(containerId)
              this.logOperation(
                labId,
                `关联容器已不存在，按已清理处理: ${containerId.substring(0, 12)}`,
                'warn'
              )
              continue
            }

            const isRunning = containerDetails.state === 'running'

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
              clearedContainerIds.add(containerId)
              this.logOperation(labId, `删除容器: ${containerId.substring(0, 12)}`, 'info')
            } else {
              // 分析删除失败原因
              let reason = result.error || '删除失败'
              if (
                result.error?.includes('HTTP code 409') ||
                result.error?.includes('container is running')
              ) {
                reason = `容器「${containerName}」正在运行，请先停止容器后再删除`
              } else if (this.isContainerMissingError(result.error)) {
                reason = `容器「${containerName}」不存在，可能已被手动删除`
                clearedContainerIds.add(containerId)
                this.logOperation(
                  labId,
                  `关联容器已不存在，按已清理处理: ${containerId.substring(0, 12)}`,
                  'warn'
                )
              } else if (result.error?.includes('permission denied')) {
                reason = `权限不足，无法删除容器「${containerName}」`
              }

              if (!clearedContainerIds.has(containerId)) {
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
            } else if (this.isContainerMissingError(errorMsg)) {
              reason = '容器不存在，可能已被手动删除'
              clearedContainerIds.add(containerId)
              this.logOperation(
                labId,
                `关联容器已不存在，按已清理处理: ${containerId.substring(0, 12)}`,
                'warn'
              )
            }

            if (!clearedContainerIds.has(containerId)) {
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
        this.logOperation(labId, deletePolicy.warning, 'warn')
        logger.info(deletePolicy.warning, 'main', {
          labId,
          creationType: lab.creationType
        })
      }

      if (failedContainers.length > 0) {
        this.removeClearedContainersFromLab(lab, clearedContainerIds)

        lab.status = 'error'
        lab.updatedAt = new Date().toISOString()
        this.saveLab(lab)

        logger.warn('部分容器删除失败，保留实验室元数据以便后续处理', 'main', {
          labId,
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
        const ownedByLab = await dockerService.isVolumeOwnedByLab(volumeName, labId)
        if (!ownedByLab) {
          this.removeClearedContainersFromLab(lab, clearedContainerIds)

          lab.status = 'error'
          lab.updatedAt = new Date().toISOString()
          this.saveLab(lab)

          return {
            success: false,
            removedContainers,
            removedWorkspace: false,
            keptWorkspace: true,
            error: `工作区 volume 不属于当前实验室: ${volumeName}`
          }
        }

        const removeWorkspaceResult = await dockerService.removeVolume(volumeName, { force })
        if (!removeWorkspaceResult.success) {
          this.removeClearedContainersFromLab(lab, clearedContainerIds)

          lab.status = 'error'
          lab.updatedAt = new Date().toISOString()
          this.saveLab(lab)

          return {
            success: false,
            removedContainers,
            removedWorkspace: false,
            keptWorkspace: true,
            error: removeWorkspaceResult.error || '删除前端工作区失败'
          }
        }

        removedWorkspace = true
        this.logOperation(labId, `删除工作区: ${volumeName}`, 'info')
      }

      // 删除实验室元数据目录
      const labPath = getLabDirPath() + '/' + labId
      if (isPathInLabDir(labPath) && existsSync(labPath)) {
        rmSync(labPath, { recursive: true, force: true })
      }

      // 构建返回结果
      const keptCount = lab.containerIds.length - clearedContainerIds.size
      const success = keptCount === 0 || !deletePolicy.shouldDeleteContainers

      logger.info('实验室删除完成', 'main', {
        labId,
        creationType: lab.creationType,
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
      logger.error('删除实验室失败', 'main', { error: errorMessage, labId })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 检查实验室关联的容器状态
   */
  async checkContainerStatus(labId: string): Promise<LabContainerStatus | null> {
    try {
      if (!isValidLabId(labId)) {
        logger.warn('无效的实验室 ID', 'main', { labId })
        return null
      }

      const lab = this.loadLab(labId)
      if (!lab) {
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

      for (const containerId of lab.containerIds) {
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

      const result: LabContainerStatus = {
        labId,
        creationType: lab.creationType,
        containerIds: lab.containerIds,
        isOrphan,
        containerStates,
        checkedAt: new Date().toISOString()
      }

      // 如果是孤儿实验室，更新元数据
      if (isOrphan && !lab.isOrphan) {
        lab.isOrphan = true
        lab.status = 'error'
        this.saveLab(lab)
        this.logOperation(labId, '检测到容器丢失，标记为孤儿实验室', 'warn')
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('检查容器状态失败', 'main', { error: errorMessage, labId })
      return null
    }
  }

  /**
   * 批量检查所有实验室的容器状态
   */
  async checkAllLabContainerStatus(): Promise<LabContainerStatus[]> {
    try {
      const labs = await this.listLabs()
      const results: LabContainerStatus[] = []

      for (const lab of labs) {
        const status = await this.checkContainerStatus(lab.labId)
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
   * 清理孤儿实验室
   * 删除容器已丢失的实验室元数据
   */
  async cleanupOrphanLab(labId: string): Promise<LabResult> {
    try {
      if (!isValidLabId(labId)) {
        return { success: false, error: '无效的实验室 ID' }
      }

      const lab = this.loadLab(labId)
      if (!lab) {
        return { success: false, error: '实验室不存在' }
      }

      // 检查是否为孤儿实验室
      const status = await this.checkContainerStatus(labId)
      if (!status || !status.isOrphan) {
        return { success: false, error: '该实验室不是孤儿实验室' }
      }

      const deleteResult = await this.deleteLab(labId, {
        deleteContainers: true,
        deleteWorkspace: false,
        force: true
      })

      if (!deleteResult.success) {
        return {
          success: false,
          error: deleteResult.error || '清理孤儿实验室失败'
        }
      }

      logger.info('孤儿实验室清理成功', 'main', {
        labId,
        keptWorkspace: deleteResult.keptWorkspace
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('清理孤儿实验室失败', 'main', { error: errorMessage, labId })
      return { success: false, error: errorMessage }
    }
  }

  private isContainerMissingError(errorMessage?: string): boolean {
    if (!errorMessage) {
      return false
    }

    return (
      errorMessage.includes('HTTP code 404') ||
      errorMessage.includes('No such container') ||
      errorMessage.includes('容器不存在') ||
      errorMessage.includes('未找到容器详情')
    )
  }

  private removeClearedContainersFromLab(
    lab: LabData,
    clearedContainerIds: Iterable<string>
  ): void {
    const clearedContainerIdSet = new Set(clearedContainerIds)
    if (clearedContainerIdSet.size === 0) {
      return
    }

    lab.containerIds = lab.containerIds.filter(
      (containerId) => !clearedContainerIdSet.has(containerId)
    )

    if (lab.primaryContainerId && clearedContainerIdSet.has(lab.primaryContainerId)) {
      lab.primaryContainerId = lab.containerIds[0]
    }
  }

  /**
   * 恢复孤儿实验室
   * 将丢失的容器替换为新容器
   */
  async recoverOrphanLab(labId: string, newContainerId: string): Promise<LabResult> {
    try {
      if (!isValidLabId(labId)) {
        return { success: false, error: '无效的实验室 ID' }
      }

      const lab = this.loadLab(labId)
      if (!lab) {
        return { success: false, error: '实验室不存在' }
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

      // 更新实验室元数据
      lab.containerIds = [newContainerId]
      lab.primaryContainerId = newContainerId
      lab.isOrphan = false
      lab.status = newContainer.state === 'running' ? 'running' : 'stopped'
      lab.updatedAt = new Date().toISOString()

      const saveResult = this.saveLab(lab)
      if (!saveResult.success) {
        return { success: false, error: '保存实验室失败' }
      }

      this.logOperation(
        labId,
        `孤儿实验室恢复成功，新容器: ${newContainerId.substring(0, 12)}`,
        'info'
      )

      logger.info('孤儿实验室恢复成功', 'main', {
        labId,
        newContainerId: newContainerId.substring(0, 12)
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('恢复孤儿实验室失败', 'main', { error: errorMessage, labId })
      return { success: false, error: errorMessage }
    }
  }
}

/** 实验室服务单例 */
export const labService = new LabService()
