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
  private static readonly EXEC_TIMEOUT_MS = 10000

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
    // 按优先级尝试：uv > conda > python3 > python
    const uvResult = await this.tryRuntime('uv')
    if (uvResult.available) {
      logger.info('PaperWebSearch: 检测到 uv 环境', 'main', {
        version: uvResult.version,
        executable: uvResult.executable
      })
      return uvResult
    }
    logger.debug('PaperWebSearch: uv 不可用', 'main', { error: uvResult.error })

    const condaResult = await this.tryRuntime('conda')
    if (condaResult.available) {
      logger.info('PaperWebSearch: 检测到 conda 环境', 'main', {
        version: condaResult.version,
        executable: condaResult.executable
      })
      return condaResult
    }
    logger.debug('PaperWebSearch: conda 不可用', 'main', { error: condaResult.error })

    // 按优先级尝试：python3 > python
    for (const pythonCmd of ['python3', 'python']) {
      try {
        const { stdout } = await execAsync(`${pythonCmd} -c "import sys; print(sys.version)"`, {
          timeout: PaperWebSearchService.EXEC_TIMEOUT_MS,
          encoding: 'utf8'
        })
        const version = stdout.trim()
        const dependencyMode = await this.checkDependencies(pythonCmd)

        return {
          available: true,
          runtime: 'python',
          executable: pythonCmd,
          version,
          dependencyMode
        }
      } catch {
        // 继续尝试下一个命令
      }
    }

    return {
      available: false,
      error: '未检测到可用的 Python 环境。请安装 Python 3.9+ 或 uv。'
    }
  }

  private async tryRuntime(runtime: PaperWebSearchRuntime): Promise<PaperWebSearchEnvironmentInfo> {
    try {
      const { stdout } = await execAsync(`${runtime} -c "import sys; print(sys.version)"`, {
        timeout: PaperWebSearchService.EXEC_TIMEOUT_MS,
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

  private async checkDependencies(runtime: string): Promise<PaperWebSearchDependencyMode> {
    try {
      const checkScript =
        `import importlib.util;` +
        `deps=['duckduckgo_search','requests','bs4'];` +
        `missing=[d for d in deps if importlib.util.find_spec(d) is None];` +
        `print('isolated' if not missing else 'system' if len(missing)<3 else 'stdlib')`

      const command = this.buildPythonCheckCommand(runtime, checkScript)
      const { stdout } = await execAsync(command, {
        timeout: PaperWebSearchService.EXEC_TIMEOUT_MS,
        encoding: 'utf8'
      })
      return stdout.trim() as PaperWebSearchDependencyMode
    } catch {
      return 'stdlib'
    }
  }

  private buildPythonCheckCommand(runtime: string, script: string): string {
    if (runtime === 'uv') {
      return `uv run python -c "${script}"`
    }
    if (runtime === 'conda') {
      return `conda run python -c "${script}"`
    }
    return `${runtime} -c "${script}"`
  }

  /**
   * 调用 Python 爬虫执行网页搜索
   * TODO: Task 6 实现 -- 通过 child_process.spawn 调用 resources/paper-web-search/crawler.py
   */
  async search(input: PaperWebSearchToolInput): Promise<PaperWebSearchOutput> {
    throw new Error(`search not implemented yet, query: ${input.query}`)
  }
}
