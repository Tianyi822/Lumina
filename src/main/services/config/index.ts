import { ConfigManager } from './ConfigManager'

export { ConfigManager, DEFAULT_THEME_COLORS } from './ConfigManager'
export {
  getConfigDirPath,
  getConfigFilePath,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME
} from './configPaths'

/**
 * 全局配置管理器实例
 */
export const configManager = new ConfigManager()
