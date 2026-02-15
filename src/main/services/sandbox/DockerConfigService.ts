import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { logger } from '@main/services/logger'
import {
  getDockerDirPath,
  getDockerfilesDirPath,
  getComposesDirPath,
  getDockerMetadataPath,
  generateDockerfileId,
  generateComposeId,
  isValidDockerfileId,
  isValidComposeId
} from './dockerPaths'
import type {
  DockerConfigMetadata,
  DockerfileConfigMeta,
  ComposeConfigMeta,
  DockerfileConfig,
  ComposeConfig,
  SaveConfigRequest,
  SaveConfigResult,
  LoadConfigResult,
  ListConfigResult,
  DeleteConfigResult
} from '@shared/types/sandbox'

export class DockerConfigService {
  private metadata: DockerConfigMetadata = { dockerfiles: [], composes: [] }
  private initialized: boolean = false

  initialize(): void {
    try {
      this.ensureDirectories()
      this.loadMetadata()
      this.initialized = true
      logger.info('Docker 配置服务初始化成功', 'main', {
        dockerfiles: this.metadata.dockerfiles.length,
        composes: this.metadata.composes.length
      })
    } catch (error) {
      logger.error('Docker 配置服务初始化失败', 'main', { error })
      this.metadata = { dockerfiles: [], composes: [] }
      this.initialized = true
    }
  }

  private ensureDirectories(): void {
    const dirs = [getDockerDirPath(), getDockerfilesDirPath(), getComposesDirPath()]
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        logger.info('创建 Docker 配置目录', 'main', { path: dir })
      }
    }
  }

  private loadMetadata(): void {
    const metadataPath = getDockerMetadataPath()
    if (!existsSync(metadataPath)) {
      this.metadata = { dockerfiles: [], composes: [] }
      return
    }

    try {
      const content = readFileSync(metadataPath, 'utf-8')
      this.metadata = JSON.parse(content) as DockerConfigMetadata
    } catch (error) {
      logger.error('加载 Docker 配置元数据失败', 'main', { error })
      this.metadata = { dockerfiles: [], composes: [] }
    }
  }

  private saveMetadata(): void {
    try {
      const metadataPath = getDockerMetadataPath()
      writeFileSync(metadataPath, JSON.stringify(this.metadata, null, 2), 'utf-8')
    } catch (error) {
      const errorMessage = `保存 Docker 配置元数据失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  // ==================== Dockerfile 操作 ====================

  listDockerfiles(): ListConfigResult<DockerfileConfigMeta> {
    if (!this.initialized) this.initialize()
    return {
      success: true,
      configs: [...this.metadata.dockerfiles].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }
  }

  loadDockerfile(id: string): LoadConfigResult<DockerfileConfig> {
    if (!this.initialized) this.initialize()

    if (!isValidDockerfileId(id)) {
      return { success: false, error: '无效的 Dockerfile ID' }
    }

    const meta = this.metadata.dockerfiles.find((d) => d.id === id)
    if (!meta) {
      return { success: false, error: 'Dockerfile 配置不存在' }
    }

    try {
      const filePath = join(getDockerfilesDirPath(), meta.filename)
      if (!existsSync(filePath)) {
        return { success: false, error: 'Dockerfile 文件不存在' }
      }

      const content = readFileSync(filePath, 'utf-8')
      return {
        success: true,
        config: { ...meta, content }
      }
    } catch (error) {
      const errorMessage = `加载 Dockerfile 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  saveDockerfile(request: SaveConfigRequest): SaveConfigResult<DockerfileConfigMeta> {
    if (!this.initialized) this.initialize()

    if (!request.name.trim()) {
      return { success: false, error: '配置名称不能为空' }
    }

    if (!request.content.trim()) {
      return { success: false, error: 'Dockerfile 内容不能为空' }
    }

    try {
      const now = new Date().toISOString()

      if (request.id && isValidDockerfileId(request.id)) {
        const existingIndex = this.metadata.dockerfiles.findIndex((d) => d.id === request.id)
        if (existingIndex !== -1) {
          const existing = this.metadata.dockerfiles[existingIndex]
          const filePath = join(getDockerfilesDirPath(), existing.filename)
          writeFileSync(filePath, request.content, 'utf-8')

          const updated: DockerfileConfigMeta = {
            ...existing,
            name: request.name.trim(),
            updatedAt: now
          }
          this.metadata.dockerfiles[existingIndex] = updated
          this.saveMetadata()

          logger.info('更新 Dockerfile 配置', 'main', { id: updated.id, name: updated.name })
          return { success: true, config: updated }
        }
      }

      const id = generateDockerfileId()
      const filename = id
      const filePath = join(getDockerfilesDirPath(), filename)
      writeFileSync(filePath, request.content, 'utf-8')

      const newConfig: DockerfileConfigMeta = {
        id,
        name: request.name.trim(),
        filename,
        createdAt: now,
        updatedAt: now
      }

      this.metadata.dockerfiles.push(newConfig)
      this.saveMetadata()

      logger.info('创建 Dockerfile 配置', 'main', { id: newConfig.id, name: newConfig.name })
      return { success: true, config: newConfig }
    } catch (error) {
      const errorMessage = `保存 Dockerfile 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  deleteDockerfile(id: string): DeleteConfigResult {
    if (!this.initialized) this.initialize()

    if (!isValidDockerfileId(id)) {
      return { success: false, error: '无效的 Dockerfile ID' }
    }

    const index = this.metadata.dockerfiles.findIndex((d) => d.id === id)
    if (index === -1) {
      return { success: false, error: 'Dockerfile 配置不存在' }
    }

    try {
      const meta = this.metadata.dockerfiles[index]
      const filePath = join(getDockerfilesDirPath(), meta.filename)

      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }

      this.metadata.dockerfiles.splice(index, 1)
      this.saveMetadata()

      logger.info('删除 Dockerfile 配置', 'main', { id, name: meta.name })
      return { success: true }
    } catch (error) {
      const errorMessage = `删除 Dockerfile 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // ==================== Compose 操作 ====================

  listComposes(): ListConfigResult<ComposeConfigMeta> {
    if (!this.initialized) this.initialize()
    return {
      success: true,
      configs: [...this.metadata.composes].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }
  }

  loadCompose(id: string): LoadConfigResult<ComposeConfig> {
    if (!this.initialized) this.initialize()

    if (!isValidComposeId(id)) {
      return { success: false, error: '无效的 Compose ID' }
    }

    const meta = this.metadata.composes.find((c) => c.id === id)
    if (!meta) {
      return { success: false, error: 'Compose 配置不存在' }
    }

    try {
      const filePath = join(getComposesDirPath(), meta.filename)
      if (!existsSync(filePath)) {
        return { success: false, error: 'Compose 文件不存在' }
      }

      const content = readFileSync(filePath, 'utf-8')
      return {
        success: true,
        config: { ...meta, content }
      }
    } catch (error) {
      const errorMessage = `加载 Compose 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  saveCompose(request: SaveConfigRequest): SaveConfigResult<ComposeConfigMeta> {
    if (!this.initialized) this.initialize()

    if (!request.name.trim()) {
      return { success: false, error: '配置名称不能为空' }
    }

    if (!request.content.trim()) {
      return { success: false, error: 'Compose 内容不能为空' }
    }

    try {
      const now = new Date().toISOString()

      if (request.id && isValidComposeId(request.id)) {
        const existingIndex = this.metadata.composes.findIndex((c) => c.id === request.id)
        if (existingIndex !== -1) {
          const existing = this.metadata.composes[existingIndex]
          const filePath = join(getComposesDirPath(), existing.filename)
          writeFileSync(filePath, request.content, 'utf-8')

          const updated: ComposeConfigMeta = {
            ...existing,
            name: request.name.trim(),
            updatedAt: now
          }
          this.metadata.composes[existingIndex] = updated
          this.saveMetadata()

          logger.info('更新 Compose 配置', 'main', { id: updated.id, name: updated.name })
          return { success: true, config: updated }
        }
      }

      const id = generateComposeId()
      const filename = `${id}.yaml`
      const filePath = join(getComposesDirPath(), filename)
      writeFileSync(filePath, request.content, 'utf-8')

      const newConfig: ComposeConfigMeta = {
        id,
        name: request.name.trim(),
        filename,
        createdAt: now,
        updatedAt: now
      }

      this.metadata.composes.push(newConfig)
      this.saveMetadata()

      logger.info('创建 Compose 配置', 'main', { id: newConfig.id, name: newConfig.name })
      return { success: true, config: newConfig }
    } catch (error) {
      const errorMessage = `保存 Compose 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  deleteCompose(id: string): DeleteConfigResult {
    if (!this.initialized) this.initialize()

    if (!isValidComposeId(id)) {
      return { success: false, error: '无效的 Compose ID' }
    }

    const index = this.metadata.composes.findIndex((c) => c.id === id)
    if (index === -1) {
      return { success: false, error: 'Compose 配置不存在' }
    }

    try {
      const meta = this.metadata.composes[index]
      const filePath = join(getComposesDirPath(), meta.filename)

      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }

      this.metadata.composes.splice(index, 1)
      this.saveMetadata()

      logger.info('删除 Compose 配置', 'main', { id, name: meta.name })
      return { success: true }
    } catch (error) {
      const errorMessage = `删除 Compose 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }
}

let dockerConfigServiceInstance: DockerConfigService | null = null

export function getDockerConfigService(): DockerConfigService {
  if (!dockerConfigServiceInstance) {
    dockerConfigServiceInstance = new DockerConfigService()
  }
  return dockerConfigServiceInstance
}

export const dockerConfigService = {
  get instance(): DockerConfigService {
    return getDockerConfigService()
  }
}
