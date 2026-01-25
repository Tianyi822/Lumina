import { app } from 'electron'
import { join } from 'path'

/**
 * 配置目录名称
 */
export const CONFIG_DIR_NAME = '.sparrow-maus'

/**
 * 配置文件名称
 */
export const CONFIG_FILE_NAME = 'config.json'

/**
 * 获取配置目录路径
 */
export function getConfigDirPath(): string {
  const homeDir = app.getPath('home')
  return join(homeDir, CONFIG_DIR_NAME)
}

/**
 * 获取配置文件路径
 */
export function getConfigFilePath(): string {
  return join(getConfigDirPath(), CONFIG_FILE_NAME)
}
