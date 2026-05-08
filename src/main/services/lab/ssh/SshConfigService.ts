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

function decrypt(encrypted: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    }
  } catch {
    logger.warn('safeStorage 解密失败，尝试 base64 回退', 'main')
  }
  return Buffer.from(encrypted, 'base64').toString('utf-8')
}

function maskConfig(config: SshConnectionConfig): SshConnectionConfig {
  return {
    ...config,
    password: config.password ? MASKED_VALUE : undefined,
    keyContent: config.keyContent ? MASKED_VALUE : undefined,
    passphrase: config.passphrase ? MASKED_VALUE : undefined
  }
}

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

function saveConfigs(configs: SshConnectionConfig[]): void {
  const configDir = getConfigDirPath()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  writeFileSync(getConfigFilePath(), JSON.stringify(configs, null, 2), 'utf-8')
}

export class SshConfigService {
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
          password: request.password ? encrypt(request.password) : existing.password,
          keyPath: request.keyPath ?? existing.keyPath,
          keyContent: request.keyContent ? encrypt(request.keyContent) : existing.keyContent,
          passphrase: request.passphrase ? encrypt(request.passphrase) : existing.passphrase,
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
        password: request.password ? encrypt(request.password) : undefined,
        keyPath: request.keyPath,
        keyContent: request.keyContent ? encrypt(request.keyContent) : undefined,
        passphrase: request.passphrase ? encrypt(request.passphrase) : undefined,
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

  getDecrypted(id: string): { success: boolean; config?: SshConnectionConfig; error?: string } {
    try {
      const configs = loadConfigs()
      const config = configs.find((c) => c.id === id)
      if (!config) {
        return { success: false, error: '配置不存在' }
      }

      const decrypted: SshConnectionConfig = {
        ...config,
        password: config.password ? decrypt(config.password) : undefined,
        keyContent: config.keyContent ? decrypt(config.keyContent) : undefined,
        passphrase: config.passphrase ? decrypt(config.passphrase) : undefined
      }

      return { success: true, config: decrypted }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
}

export const sshConfigService = new SshConfigService()
