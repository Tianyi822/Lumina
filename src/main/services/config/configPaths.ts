import { app } from 'electron'
import { join } from 'path'

/**
 * 配置目录名称
 */
export const CONFIG_DIR_NAME = '.sparrow-manus'

/**
 * 配置文件名称
 */
export const CONFIG_FILE_NAME = 'config.json'

/**
 * 数据存储目录名称（向量数据库等）
 */
export const DATA_DIR_NAME = 'data'

/**
 * 向量数据库存储目录名称
 */
export const VECTOR_DB_DIR_NAME = 'db'

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

/**
 * 获取数据存储目录路径
 * @returns ~/.sparrow-manus/data
 */
export function getDataDirPath(): string {
  return join(getConfigDirPath(), DATA_DIR_NAME)
}

/**
 * 获取向量数据库存储目录路径
 * @returns ~/.sparrow-manus/data/db
 */
export function getVectorDBDirPath(): string {
  return join(getDataDirPath(), VECTOR_DB_DIR_NAME)
}
