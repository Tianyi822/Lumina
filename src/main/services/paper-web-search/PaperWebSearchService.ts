import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import type {
  PaperWebSearchEnvironmentInfo,
  PaperWebSearchRuntime,
  PaperWebSearchDependencyMode,
  PaperWebSearchOutput,
  PaperWebSearchToolInput
} from '@shared/types/paper-web-search'

const execAsync = promisify(exec)

export class PaperWebSearchService {
  private envCheckCache: PaperWebSearchEnvironmentInfo | null = null

  async checkEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
    if (this.envCheckCache) {
      return this.envCheckCache
    }

    this.envCheckCache = await this.detectEnvironment()
    return this.envCheckCache
  }

  clearEnvironmentCache(): void {
    this.envCheckCache = null
  }

  private async detectEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
    // 按优先级尝试：uv > conda > python
    const uvResult = await this.tryRuntime('uv')
    if (uvResult.available) {
      logger.info('PaperWebSearch: 检测到 uv 环境', 'main', {
        version: uvResult.version,
        executable: uvResult.executable
      })
      return uvResult
    }

    const condaResult = await this.tryRuntime('conda')
    if (condaResult.available) {
      logger.info('PaperWebSearch: 检测到 conda 环境', 'main', {
        version: condaResult.version,
        executable: condaResult.executable
      })
      return condaResult
    }

    const pythonResult = await this.tryRuntime('python')
    if (pythonResult.available) {
      return pythonResult
    }

    return {
      available: false,
      error: '未检测到可用的 Python 环境。请安装 Python 3.9+ 或 uv。'
    }
  }

  private async tryRuntime(
    runtime: PaperWebSearchRuntime
  ): Promise<PaperWebSearchEnvironmentInfo> {
    try {
      const { stdout } = await execAsync(`${runtime} --version`, {
        timeout: 10000,
        encoding: 'utf8'
      })
      const version = stdout.trim()
      const dependencyMode = await this.checkDependencies(runtime)

      return {
        available: true,
        runtime,
        executable: runtime,
        version,
        dependencyMode
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        available: false,
        runtime,
        error: message
      }
    }
  }

  private async checkDependencies(
    runtime: string
  ): Promise<PaperWebSearchDependencyMode> {
    try {
      const checkScript = `import importlib.util;deps=['duckduckgo_search','requests','bs4'];missing=[d for d in deps if importlib.util.find_spec(d) is None];print('isolated' if not missing else 'system' if len(missing)<3 else 'stdlib')`
      const { stdout } = await execAsync(`${runtime} -c "${checkScript}"`, {
        timeout: 10000,
        encoding: 'utf8'
      })
      return stdout.trim() as PaperWebSearchDependencyMode
    } catch {
      return 'stdlib'
    }
  }

  /**
   * 调用 Python 爬虫执行搜索（后续 Task 实现）
   */
  async search(_input: PaperWebSearchToolInput): Promise<PaperWebSearchOutput> {
    throw new Error('Not implemented - will be added in Task 6')
  }
}
