import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { app } from 'electron'
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
   */
  async search(input: PaperWebSearchToolInput): Promise<PaperWebSearchOutput> {
    const startTime = Date.now()

    // 1. 检查环境
    const envInfo = await this.checkEnvironment()
    if (!envInfo.available || !envInfo.executable) {
      return {
        success: false,
        query: input.query,
        quality: 'empty',
        results: [],
        totalDiscovered: 0,
        totalCrawled: 0,
        totalRetained: 0,
        elapsedMs: Date.now() - startTime,
        error: envInfo.error || 'Python 环境不可用'
      }
    }

    // 2. 确定 Python 可执行文件路径
    const pythonExecutable = envInfo.executable
    const crawlerPath = getCrawlerPath()

    // 3. 构建 JSON 输入
    const inputJson = JSON.stringify({
      query: input.query,
      reason: input.reason,
      paper_context: {
        paper_id: input.paperContext.paperId,
        file_name: input.paperContext.fileName,
        paper_title: input.paperContext.paperTitle,
        paper_authors: input.paperContext.paperAuthors,
        paper_keywords: input.paperContext.paperKeywords,
        selected_quote: input.paperContext.selectedQuote,
        selected_quote_context: input.paperContext.selectedQuoteContext,
        user_question: input.paperContext.userQuestion,
        reference_hints: input.paperContext.referenceHints
      },
      limits: {
        max_results: 5,
        max_snippet_chars: 1000,
        max_total_chars: 5000,
        timeout_seconds: 30
      }
    })

    // 4. 通过 spawn 调用爬虫
    return new Promise<PaperWebSearchOutput>((resolve) => {
      let stdout = ''
      let stderr = ''

      const child = spawn(pythonExecutable, [crawlerPath], {
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      child.stdout?.on('data', (data: Buffer) => {
        const remaining = 102400 - Buffer.byteLength(stdout, 'utf8')
        if (remaining <= 0) return
        stdout += data.toString('utf8').slice(0, remaining)
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })

      child.on('error', (error: Error) => {
        logger.error(`PaperWebSearch: 爬虫启动失败: ${error.message}`, 'main')
        resolve({
          success: false,
          query: input.query,
          quality: 'empty',
          results: [],
          totalDiscovered: 0,
          totalCrawled: 0,
          totalRetained: 0,
          elapsedMs: Date.now() - startTime,
          error: `爬虫启动失败: ${error.message}`
        })
      })

      child.on('close', (exitCode: number | null) => {
        const elapsed = Date.now() - startTime

        if (exitCode !== 0) {
          const errMsg = stderr.trim() || `爬虫退出码: ${exitCode}`
          logger.warn(`PaperWebSearch: 爬虫异常退出 (exit=${exitCode})`, 'main', {
            stderr: stderr.trim()
          })
          resolve({
            success: false,
            query: input.query,
            quality: 'empty',
            results: [],
            totalDiscovered: 0,
            totalCrawled: 0,
            totalRetained: 0,
            elapsedMs: elapsed,
            error: errMsg
          })
          return
        }

        if (!stdout.trim()) {
          logger.warn('PaperWebSearch: 爬虫 stdout 为空', 'main', { stderr: stderr.trim() })
          resolve({
            success: false,
            query: input.query,
            quality: 'empty',
            results: [],
            totalDiscovered: 0,
            totalCrawled: 0,
            totalRetained: 0,
            elapsedMs: elapsed,
            error: '爬虫返回了空结果'
          })
          return
        }

        try {
          const output: PaperWebSearchOutput = JSON.parse(stdout.trim())
          output.elapsedMs = elapsed
          resolve(output)
        } catch (parseError) {
          const msg = parseError instanceof Error ? parseError.message : String(parseError)
          logger.error(`PaperWebSearch: stdout JSON 解析失败: ${msg}`, 'main')
          resolve({
            success: false,
            query: input.query,
            quality: 'empty',
            results: [],
            totalDiscovered: 0,
            totalCrawled: 0,
            totalRetained: 0,
            elapsedMs: elapsed,
            error: `爬虫输出解析失败: ${msg}`
          })
        }
      })

      // 5. 写入 stdin 并关闭
      child.stdin?.write(inputJson)
      child.stdin?.end()
    })
  }
}

function getCrawlerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'paper-web-search', 'crawler.py')
  }
  return path.join(__dirname, '..', '..', '..', '..', '..', 'resources', 'paper-web-search', 'crawler.py')
}
