import { existsSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { logger } from '@main/services/logger'
import { configManager } from '@main/services/config'
import {
  MCPServerConfig,
  MCPConfigSaveResult,
  MCPConfigImportResult,
  MCPConfigFile
} from '@main/types/mcp'

// MCP 配置目录名称（用于迁移旧配置）
const MCP_CONFIG_DIR_NAME = 'mcp'

// 获取旧的 MCP 配置目录路径（用于迁移）
function getOldMCPConfigDirPath(): string {
  const homeDir = app.getPath('home')
  return join(homeDir, '.lumina', MCP_CONFIG_DIR_NAME)
}

// MCP 配置管理器
// 负责 MCP 服务器配置的持久化管理
// 配置统一保存在主配置文件中，不再使用独立文件
export class MCPConfigManager {
  private migrationCompleted: boolean = false

  private validateConfig(serverConfig: MCPServerConfig): string | null {
    if (!serverConfig.name?.trim()) {
      return 'MCP 配置名称不能为空'
    }

    if (serverConfig.transport === 'stdio') {
      if (!serverConfig.command?.trim()) {
        return `MCP 配置 ${serverConfig.name} 的执行命令不能为空`
      }
    } else if (!serverConfig.url?.trim()) {
      return `MCP 配置 ${serverConfig.name} 的服务地址不能为空`
    }

    return null
  }

  // 初始化配置管理器
  // 首次初始化时会自动迁移旧配置
  initialize(): void {
    this.migrateOldConfigs()
    logger.info('MCP 配置管理器初始化完成')
  }

  // 从旧配置目录迁移所有配置到主配置文件
  private migrateOldConfigs(): void {
    if (this.migrationCompleted) {
      return
    }

    const oldConfigDir = getOldMCPConfigDirPath()

    // 检查旧配置目录是否存在
    if (!existsSync(oldConfigDir)) {
      this.migrationCompleted = true
      return
    }

    try {
      const files = readdirSync(oldConfigDir).filter((f) => f.endsWith('.json'))
      let migratedCount = 0

      for (const file of files) {
        try {
          const filePath = join(oldConfigDir, file)
          const content = readFileSync(filePath, 'utf-8')
          const config = JSON.parse(content) as MCPServerConfig

          if (config.name) {
            // 保存到主配置
            const result = this.saveConfig(config)
            if (result.success) {
              migratedCount++
              // 删除旧配置文件
              unlinkSync(filePath)
              logger.info(`已迁移 MCP 配置: ${config.name}`)
            }
          }
        } catch (error) {
          logger.error(
            `迁移 MCP 配置文件失败: ${file} - ${error instanceof Error ? error.message : String(error)}`,
            'main'
          )
        }
      }

      // 尝试删除旧的配置目录（如果为空）
      try {
        const remainingFiles = readdirSync(oldConfigDir)
        if (remainingFiles.length === 0) {
          rmdirSync(oldConfigDir)
          logger.info('已删除空的旧 MCP 配置目录')
        }
      } catch {
        // 目录删除失败不影响迁移结果
      }

      this.migrationCompleted = true
      logger.info(`MCP 配置迁移完成: 成功迁移 ${migratedCount} 个配置`)
    } catch (error) {
      logger.error(
        `读取旧 MCP 配置目录失败: ${error instanceof Error ? error.message : String(error)}`,
        'main'
      )
      this.migrationCompleted = true
    }
  }

  // 列出所有 MCP 配置
  listConfigs(): MCPServerConfig[] {
    const config = configManager.getConfig()
    if (!config) {
      return []
    }

    return Object.values(config.mcpServers || {})
  }

  // 获取单个 MCP 配置
  getConfig(name: string): MCPServerConfig | null {
    const config = configManager.getConfig()
    if (!config || !config.mcpServers) {
      return null
    }

    return config.mcpServers[name] || null
  }

  // 保存 MCP 配置
  saveConfig(serverConfig: MCPServerConfig): MCPConfigSaveResult {
    try {
      const validationMessage = this.validateConfig(serverConfig)
      if (validationMessage) {
        return {
          success: false,
          error: validationMessage
        }
      }

      const config = configManager.getConfig()
      if (!config) {
        return {
          success: false,
          error: '无法访问主配置'
        }
      }

      // 确保 mcpServers 对象存在
      if (!config.mcpServers) {
        config.mcpServers = {}
      }

      // 保存配置
      config.mcpServers[serverConfig.name] = serverConfig

      // 保存到主配置文件
      const result = configManager.saveConfig(config)

      if (result.success) {
        logger.info(`MCP 配置保存成功: ${serverConfig.name}`)
      }

      return result
    } catch (error) {
      const errorMessage = `保存 MCP 配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // 批量保存 MCP 配置
  saveConfigs(configs: MCPServerConfig[]): MCPConfigSaveResult {
    try {
      for (const serverConfig of configs) {
        const validationMessage = this.validateConfig(serverConfig)
        if (validationMessage) {
          return {
            success: false,
            error: validationMessage
          }
        }
      }

      const config = configManager.getConfig()
      if (!config) {
        return {
          success: false,
          error: '无法访问主配置'
        }
      }

      // 确保 mcpServers 对象存在
      if (!config.mcpServers) {
        config.mcpServers = {}
      }

      // 保存所有配置
      for (const serverConfig of configs) {
        config.mcpServers[serverConfig.name] = serverConfig
      }

      // 保存到主配置文件
      const result = configManager.saveConfig(config)

      if (result.success) {
        logger.info(`批量保存 MCP 配置成功: ${configs.length} 个`)
      }

      return result
    } catch (error) {
      const errorMessage = `批量保存 MCP 配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // 删除 MCP 配置
  deleteConfig(name: string): MCPConfigSaveResult {
    try {
      const config = configManager.getConfig()
      if (!config || !config.mcpServers) {
        return {
          success: false,
          error: '无法访问主配置'
        }
      }

      // 检查配置是否存在
      if (!config.mcpServers[name]) {
        return {
          success: false,
          error: `配置不存在: ${name}`
        }
      }

      // 删除配置
      delete config.mcpServers[name]

      // 保存到主配置文件
      const result = configManager.saveConfig(config)

      if (result.success) {
        logger.info(`MCP 配置删除成功: ${name}`)
      }

      return result
    } catch (error) {
      const errorMessage = `删除 MCP 配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // 从 JSON 批量导入 MCP 配置
  // 支持标准 MCP 配置文件格式（如 Claude Desktop 的配置）
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

      const configsToImport: MCPServerConfig[] = []

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

          configsToImport.push(config)
        } catch (error) {
          result.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // 批量保存
      if (configsToImport.length > 0) {
        const saveResult = this.saveConfigs(configsToImport)
        if (saveResult.success) {
          result.imported = configsToImport.length
        } else {
          result.errors.push(`批量保存失败: ${saveResult.error}`)
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

  // 重新加载配置
  // 从主配置文件重新读取
  reloadConfigs(): void {
    // 配置已经由 ConfigManager 统一管理，这里不需要额外操作
    logger.info('MCP 配置重新加载完成')
  }

  // 获取已启用的配置列表
  getEnabledConfigs(): MCPServerConfig[] {
    return this.listConfigs().filter((c) => c.enabled)
  }

  // 配置是否存在
  configExists(name: string): boolean {
    const config = configManager.getConfig()
    if (!config || !config.mcpServers) {
      return false
    }

    return name in config.mcpServers
  }

  // 导出所有配置为 JSON（用于备份）
  exportConfigs(): string {
    const config = configManager.getConfig()
    if (!config || !config.mcpServers) {
      return JSON.stringify({ mcpServers: {} }, null, 2)
    }

    // 转换为标准 MCP 配置格式
    const exportData: MCPConfigFile = {
      mcpServers: {}
    }

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      exportData.mcpServers[name] = {
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
        url: serverConfig.url,
        headers: serverConfig.headers
      }
    }

    return JSON.stringify(exportData, null, 2)
  }
}
