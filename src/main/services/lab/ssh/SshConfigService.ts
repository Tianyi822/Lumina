import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getConfigDirPath } from '@main/services/config/configPaths'
import { logger } from '@main/services/logger'
import type {
  SshConnectionConfig,
  SaveSshConfigRequest,
  SaveSshConfigResult,
  ListSshConfigsResult
} from '@shared/types/lab'

const SSH_CONFIG_FILE = 'ssh-connections.json'
const MASKED_VALUE = '********'

function getConfigFilePath(): string {
  return join(getConfigDirPath(), SSH_CONFIG_FILE)
}

/**
 * 加密敏感字符串
 * 优先使用 Electron safeStorage，不可用时回退到 base64 编码
 */
function encrypt(value: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64')
    }
  } catch {
    logger.warn('safeStorage 不可用，使用 base64 回退加密', 'main')
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

/**
 * 对配置中的敏感字段（keyContent）进行掩码处理
 */
function maskConfig(config: SshConnectionConfig): SshConnectionConfig {
  return {
    ...config,
    keyContent: config.keyContent ? MASKED_VALUE : undefined
  }
}

/**
 * 从磁盘加载 SSH 配置列表
 */
function loadConfigs(): SshConnectionConfig[] {
  const filePath = getConfigFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as SshConnectionConfig[]
  } catch {
    logger.warn('SSH 配置文件读取失败', 'main')
    return []
  }
}

/**
 * 保存 SSH 配置列表到磁盘
 */
function saveConfigs(configs: SshConnectionConfig[]): void {
  const configDir = getConfigDirPath()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  writeFileSync(getConfigFilePath(), JSON.stringify(configs, null, 2), 'utf-8')
}

/**
 * SSH 配置持久化服务
 * 管理 SSH 服务器连接配置的增删改查，支持密钥加密存储
 */
export class SshConfigService {
  /**
   * 列出所有 SSH 配置（密钥字段将被遮蔽）
   */
  list(): ListSshConfigsResult {
    try {
      const configs = loadConfigs()
      return { success: true, configs: configs.map(maskConfig) }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /**
   * 获取指定 SSH 配置
   */
  get(id: string): { success: boolean; config?: SshConnectionConfig; error?: string } {
    try {
      const configs = loadConfigs()
      const config = configs.find((c) => c.id === id)
      if (!config) {
        return { success: false, error: '配置不存在' }
      }
      return { success: true, config: maskConfig(config) }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /**
   * 保存或更新 SSH 配置
   * 有 id 为更新，无 id 为新建（自动生成 id）
   */
  save(request: SaveSshConfigRequest): SaveSshConfigResult {
    try {
      const configs = loadConfigs()

      if (request.id) {
        const index = configs.findIndex((c) => c.id === request.id)
        if (index === -1) {
          return { success: false, error: '配置不存在' }
        }

        const existing = configs[index]
        configs[index] = {
          ...existing,
          name: request.name,
          host: request.host,
          port: request.port,
          username: request.username,
          authType: request.authType,
          keyName: request.keyName ?? existing.keyName,
          keyContent: request.keyContent ? encrypt(request.keyContent) : existing.keyContent,
          lastUsedAt: new Date().toISOString()
        }

        saveConfigs(configs)
        logger.info('SSH 配置已更新', 'main', { id: request.id })
        return { success: true, config: maskConfig(configs[index]) }
      }

      const nameExists = configs.some((c) => c.name === request.name)
      if (nameExists) {
        return { success: false, error: '配置名称已存在' }
      }

      const newConfig: SshConnectionConfig = {
        id: randomUUID(),
        name: request.name,
        host: request.host,
        port: request.port,
        username: request.username,
        authType: request.authType,
        keyName: request.keyName,
        keyContent: request.keyContent ? encrypt(request.keyContent) : undefined,
        lastUsedAt: new Date().toISOString()
      }

      configs.push(newConfig)
      saveConfigs(configs)
      logger.info('SSH 配置已创建', 'main', { id: newConfig.id })
      return { success: true, config: maskConfig(newConfig) }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /**
   * 删除 SSH 配置
   */
  delete(id: string): { success: boolean; error?: string } {
    try {
      const configs = loadConfigs()
      const index = configs.findIndex((c) => c.id === id)
      if (index === -1) {
        return { success: false, error: '配置不存在' }
      }

      configs.splice(index, 1)
      saveConfigs(configs)
      logger.info('SSH 配置已删除', 'main', { id })
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
}

export const sshConfigService = new SshConfigService()
