import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  watch,
  FSWatcher
} from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { logger } from '@main/services/logger'
import {
  MCPServerConfig,
  MCPConfigSaveResult,
  MCPConfigImportResult,
  MCPConfigFile
} from '@main/types/mcp'

/**
 * MCP 配置目录名称
 */
const MCP_CONFIG_DIR_NAME = 'mcp'

/**
 * 获取 MCP 配置目录路径
 */
export function getMCPConfigDirPath(): string {
  const homeDir = app.getPath('home')
  return join(homeDir, '.sparrow-manus', MCP_CONFIG_DIR_NAME)
}

/**
 * 获取 MCP 配置文件路径
 */
export function getMCPConfigFilePath(name: string): string {
  return join(getMCPConfigDirPath(), `${name}.json`)
}

/**
 * MCP 配置管理器
 * 负责 MCP 服务器配置的持久化管理
 */
export class MCPConfigManager {
  private configCache: Map<string, MCPServerConfig> = new Map()
  private watcher: FSWatcher | null = null
  private onConfigChangeCallback: (() => void) | null = null

  /**
   * 确保 MCP 配置目录存在
   */
  private ensureConfigDir(): void {
    const configDir = getMCPConfigDirPath()
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
  }

  /**
   * 初始化配置管理器
   */
  initialize(): void {
    this.ensureConfigDir()
    this.loadAllConfigs()
    logger.info('MCP 配置管理器初始化完成')
  }

  /**
   * 加载所有 MCP 配置
   */
  private loadAllConfigs(): void {
    const configDir = getMCPConfigDirPath()
    this.configCache.clear()

    if (!existsSync(configDir)) {
      return
    }

    try {
      const files = readdirSync(configDir).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        try {
          const filePath = join(configDir, file)
          const content = readFileSync(filePath, 'utf-8')
          const config = JSON.parse(content) as MCPServerConfig
          if (config.name) {
            this.configCache.set(config.name, config)
          }
        } catch (error) {
          logger.error(
            `加载 MCP 配置文件失败: ${file} - ${error instanceof Error ? error.message : String(error)}`,
            'main'
          )
        }
      }
      logger.info(`已加载 ${this.configCache.size} 个 MCP 配置`)
    } catch (error) {
      logger.error(
        `读取 MCP 配置目录失败: ${error instanceof Error ? error.message : String(error)}`,
        'main'
      )
    }
  }

  /**
   * 列出所有 MCP 配置
   */
  listConfigs(): MCPServerConfig[] {
    return Array.from(this.configCache.values())
  }

  /**
   * 获取单个 MCP 配置
   */
  getConfig(name: string): MCPServerConfig | null {
    return this.configCache.get(name) || null
  }

  /**
   * 保存 MCP 配置
   */
  saveConfig(config: MCPServerConfig): MCPConfigSaveResult {
    try {
      this.ensureConfigDir()
      const filePath = getMCPConfigFilePath(config.name)
      const content = JSON.stringify(config, null, 2)
      writeFileSync(filePath, content, 'utf-8')
      this.configCache.set(config.name, config)
      logger.info(`MCP 配置保存成功: ${config.name}`)
      return { success: true }
    } catch (error) {
      const errorMessage = `保存 MCP 配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除 MCP 配置
   */
  deleteConfig(name: string): MCPConfigSaveResult {
    try {
      const filePath = getMCPConfigFilePath(name)
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
      this.configCache.delete(name)
      logger.info(`MCP 配置删除成功: ${name}`)
      return { success: true }
    } catch (error) {
      const errorMessage = `删除 MCP 配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 从 JSON 批量导入 MCP 配置
   * 支持标准 MCP 配置文件格式
   */
  importFromJson(jsonContent: string): MCPConfigImportResult {
    const result: MCPConfigImportResult = {
      success: true,
      imported: 0,
      errors: []
    }

    try {
      const parsed = JSON.parse(jsonContent) as MCPConfigFile

      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        return {
          success: false,
          imported: 0,
          errors: ['无效的配置格式：缺少 mcpServers 字段']
        }
      }

      for (const [name, serverConfig] of Object.entries(parsed.mcpServers)) {
        try {
          // 判断传输类型
          let transport: 'stdio' | 'sse' | 'streamableHttp' = 'stdio'
          if (serverConfig.url) {
            // 根据 URL 判断类型
            transport = serverConfig.url.includes('/sse') ? 'sse' : 'streamableHttp'
          }

          const config: MCPServerConfig = {
            name,
            transport,
            enabled: true,
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env,
            url: serverConfig.url,
            headers: serverConfig.headers
          }

          const saveResult = this.saveConfig(config)
          if (saveResult.success) {
            result.imported++
          } else {
            result.errors.push(`${name}: ${saveResult.error}`)
          }
        } catch (error) {
          result.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (result.errors.length > 0) {
        result.success = result.imported > 0
      }

      logger.info(`MCP 配置导入完成: 成功 ${result.imported} 个, 失败 ${result.errors.length} 个`)
      return result
    } catch (error) {
      const errorMessage = `解析 JSON 失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        imported: 0,
        errors: [errorMessage]
      }
    }
  }

  /**
   * 启动配置目录监听（热加载）
   */
  watchConfigDir(onConfigChange: () => void): void {
    this.onConfigChangeCallback = onConfigChange
    const configDir = getMCPConfigDirPath()

    this.ensureConfigDir()

    try {
      this.watcher = watch(configDir, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          logger.info(`MCP 配置文件变更: ${eventType} - ${filename}`)
          this.loadAllConfigs()
          if (this.onConfigChangeCallback) {
            this.onConfigChangeCallback()
          }
        }
      })
      logger.info('MCP 配置目录监听已启动')
    } catch (error) {
      logger.error(
        `启动 MCP 配置监听失败: ${error instanceof Error ? error.message : String(error)}`,
        'main'
      )
    }
  }

  /**
   * 停止配置目录监听
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      logger.info('MCP 配置目录监听已停止')
    }
  }

  /**
   * 重新加载所有配置
   */
  reloadConfigs(): void {
    this.loadAllConfigs()
  }

  /**
   * 获取已启用的配置列表
   */
  getEnabledConfigs(): MCPServerConfig[] {
    return this.listConfigs().filter((c) => c.enabled)
  }

  /**
   * 配置是否存在
   */
  configExists(name: string): boolean {
    return this.configCache.has(name)
  }
}
