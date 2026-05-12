import { app } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'

/**
 * 配置目录名称
 */
export const CONFIG_DIR_NAME = '.lumina'

/**
 * 知识库存储目录名称
 */
export const KNOWLEDGE_DIR_NAME = 'knowledge'

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
 * 注册表键路径
 */
const REG_KEY = 'HKCU\\Software\\Lumina'

/**
 * 从 Windows 注册表读取 Lumina 数据路径
 * 返回注册表中的 DataPath 值，读取失败返回 null
 */
function readDataPathFromRegistry(): string | null {
  try {
    const output = execSync(`reg query ${REG_KEY} /v DataPath`, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // reg query 输出格式：
    // HKEY_CURRENT_USER\Software\Lumina
    //     DataPath    REG_SZ    C:\Users\xxx\AppData\Local\LuminaData
    const match = output.match(/DataPath\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
    if (match && match[1]) {
      return match[1].trim()
    }
    return null
  } catch {
    // 注册表键或值不存在
    return null
  }
}

/**
 * 获取配置目录路径
 * Windows 下优先从注册表读取 DataPath，读取失败回退到 ~/.lumina
 * macOS/Linux 返回 ~/.lumina
 */
export function getConfigDirPath(): string {
  if (process.platform === 'win32') {
    const regPath = readDataPathFromRegistry()
    if (regPath) {
      try {
        // 确保目录存在
        if (!existsSync(regPath)) {
          mkdirSync(regPath, { recursive: true })
        }
        return regPath
      } catch {
        // 目录创建失败（权限不足等），回退到默认路径
        // 注意：此处使用 console.warn 而非 logger.warn，
        // 因为 configPaths 是底层模块，logger 可能依赖它获取日志路径
        console.warn(`无法访问注册表指定的数据目录 "${regPath}"，回退到默认路径`)
      }
    }
  }

  const homeDir = app.getPath('home')
  return join(homeDir, CONFIG_DIR_NAME)
}

/**
 * 获取配置文件路径
 * 返回配置目录下的 config.json 文件路径
 */
export function getConfigFilePath(): string {
  return join(getConfigDirPath(), CONFIG_FILE_NAME)
}

/**
 * 获取知识库存储目录路径
 */
export function getKnowledgeDirPath(): string {
  return join(getConfigDirPath(), KNOWLEDGE_DIR_NAME)
}

/**
 * 获取知识库数据存储目录路径
 */
export function getDataDirPath(): string {
  return join(getKnowledgeDirPath(), DATA_DIR_NAME)
}

/**
 * 获取向量数据库存储目录路径
 */
export function getVectorDBDirPath(): string {
  return join(getDataDirPath(), VECTOR_DB_DIR_NAME)
}
