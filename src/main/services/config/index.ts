import { ConfigManager } from './ConfigManager'

/** @public 配置管理器对外公共 API（稳定导出表面） */
export { ConfigManager } from './ConfigManager'
/** @public 配置系统路径/常量对外公共 API（稳定导出表面） */
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
