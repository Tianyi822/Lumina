import { logger } from '@main/services/logger'
import type {
  FrontendBootstrapState,
  FrontendBootstrapStatus,
  ProjectTemplate,
  SandboxData
} from '@shared/types/sandbox'
import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { sandboxFileService } from '../file'
import {
  FRONTEND_BOOTSTRAP_STATE_FILE,
  FRONTEND_INSTALL_TIMEOUT_SECONDS,
  FRONTEND_STARTUP_LOG_PATH,
  PREVIEW_READY_TIMEOUT_MS
} from './constants'
import { checkHttpReady, waitForHttpReady } from './waitForHttpReady'

const dockerService = getDockerService()

const BOOTSTRAP_STATUS_ORDER: FrontendBootstrapStatus[] = [
  'pending',
  'workspace-ready',
  'deps-ready',
  'runtime-ready',
  'build-ready'
]

const DEFAULT_BOOTSTRAP_STATE: FrontendBootstrapState = {
  bootstrapStatus: 'pending',
  workspaceInitialized: false,
  dependenciesInstalled: false,
  buildValidated: false
}

export interface FrontendBootstrapOptions {
  installDependencies: boolean
  autoStart: boolean
  throwOnFailure: boolean
}

export interface FrontendBootstrapResult {
  previewReady: boolean
  previewUrl?: string
  warning?: string
  state: FrontendBootstrapState
}

export interface FrontendBuildValidationOptions {
  force?: boolean
}

/**
 * 前端工作区 bootstrap 服务
 * 负责统一推进工作区、依赖、运行时和构建状态
 */
export class FrontendWorkspaceBootstrapService {
  /**
   * 统一推进前端工作区状态
   */
  async bootstrapWorkspace(
    sandbox: SandboxData,
    template: ProjectTemplate,
    options: FrontendBootstrapOptions
  ): Promise<FrontendBootstrapResult> {
    try {
      let state = await this.readBootstrapState(sandbox)

      state = await this.ensureWorkspaceReady(sandbox, template, state)

      if (options.installDependencies) {
        state = await this.ensureDependenciesReady(sandbox, template, state)
      }

      if (!options.autoStart) {
        return {
          previewReady: false,
          previewUrl: sandbox.frontend?.previewUrl,
          state
        }
      }

      return this.ensureRuntimeReady(sandbox, template, state)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      try {
        const currentState = await this.readBootstrapState(sandbox)
        await this.writeBootstrapState(sandbox, {
          ...currentState,
          bootstrapStatus: 'error',
          lastBootstrapAt: new Date().toISOString(),
          bootstrapError: errorMessage
        })
      } catch (stateError) {
        logger.warn('写入前端 bootstrap 错误状态失败', 'main', {
          sandboxId: sandbox.sandboxId,
          error: stateError instanceof Error ? stateError.message : String(stateError)
        })
      }

      if (options.throwOnFailure) {
        throw error
      }

      return {
        previewReady: false,
        previewUrl: sandbox.frontend?.previewUrl,
        warning: errorMessage,
        state: await this.readBootstrapState(sandbox)
      }
    }
  }

  /**
   * 确保工作区文件已就绪
   */
  async ensureWorkspaceReady(
    sandbox: SandboxData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState
  ): Promise<FrontendBootstrapState> {
    const state = currentState || (await this.readBootstrapState(sandbox))
    const looksInitialized =
      state.workspaceInitialized || (await this.pathExists(sandbox, 'package.json'))

    if (looksInitialized) {
      return this.writeBootstrapState(sandbox, {
        ...state,
        workspaceInitialized: true,
        bootstrapStatus:
          state.bootstrapStatus === 'error'
            ? 'workspace-ready'
            : this.maxBootstrapStatus(state.bootstrapStatus, 'workspace-ready'),
        lastBootstrapAt: new Date().toISOString(),
        bootstrapError: undefined
      })
    }

    const writeResult = await sandboxFileService.writeProjectFiles(
      sandbox.sandboxId,
      template.files,
      sandbox.frontend!.projectRoot
    )

    if (!writeResult.success) {
      throw new Error(writeResult.error || '初始化项目模板失败')
    }

    return this.writeBootstrapState(sandbox, {
      ...state,
      workspaceInitialized: true,
      bootstrapStatus: 'workspace-ready',
      lastBootstrapAt: new Date().toISOString(),
      bootstrapError: undefined
    })
  }

  /**
   * 确保依赖已安装
   */
  async ensureDependenciesReady(
    sandbox: SandboxData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState
  ): Promise<FrontendBootstrapState> {
    const state = currentState || (await this.readBootstrapState(sandbox))
    const dependenciesReady =
      state.dependenciesInstalled || (await this.pathExists(sandbox, 'node_modules'))

    if (dependenciesReady) {
      return this.writeBootstrapState(sandbox, {
        ...state,
        workspaceInitialized: true,
        dependenciesInstalled: true,
        bootstrapStatus:
          state.bootstrapStatus === 'error'
            ? 'deps-ready'
            : this.maxBootstrapStatus(state.bootstrapStatus, 'deps-ready'),
        lastBootstrapAt: new Date().toISOString(),
        bootstrapError: undefined
      })
    }

    const result = await dockerService.execCommand(sandbox.primaryContainerId!, {
      command: template.installCommand,
      workdir: sandbox.frontend!.projectRoot,
      timeout: FRONTEND_INSTALL_TIMEOUT_SECONDS
    })

    if (!result || result.exitCode !== 0) {
      throw new Error(
        this.buildExecErrorMessage('安装项目依赖失败', result?.stdout, result?.stderr)
      )
    }

    return this.writeBootstrapState(sandbox, {
      ...state,
      workspaceInitialized: true,
      dependenciesInstalled: true,
      bootstrapStatus: 'deps-ready',
      lastBootstrapAt: new Date().toISOString(),
      bootstrapError: undefined
    })
  }

  /**
   * 确保前端运行时已就绪
   */
  async ensureRuntimeReady(
    sandbox: SandboxData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState
  ): Promise<FrontendBootstrapResult> {
    const state = currentState || (await this.readBootstrapState(sandbox))
    const previewUrl = sandbox.frontend!.previewUrl

    if (await checkHttpReady(previewUrl)) {
      const nextState = await this.writeBootstrapState(sandbox, {
        ...state,
        workspaceInitialized: true,
        dependenciesInstalled: true,
        bootstrapStatus: 'runtime-ready',
        lastBootstrapAt: new Date().toISOString(),
        bootstrapError: undefined
      })

      return {
        previewReady: true,
        previewUrl,
        state: nextState
      }
    }

    const startResult = await dockerService.execCommand(sandbox.primaryContainerId!, {
      command: `nohup ${template.startCommand} > ${FRONTEND_STARTUP_LOG_PATH} 2>&1 &`,
      workdir: sandbox.frontend!.projectRoot,
      timeout: 30
    })

    if (!startResult || startResult.exitCode !== 0) {
      throw new Error(
        this.buildExecErrorMessage(
          '启动前端开发服务器失败',
          startResult?.stdout,
          startResult?.stderr
        )
      )
    }

    const previewReady = await waitForHttpReady(previewUrl, PREVIEW_READY_TIMEOUT_MS)
    const nextState = await this.writeBootstrapState(
      sandbox,
      previewReady
        ? {
            ...state,
            workspaceInitialized: true,
            dependenciesInstalled: true,
            bootstrapStatus: 'runtime-ready',
            lastBootstrapAt: new Date().toISOString(),
            bootstrapError: undefined
          }
        : {
            ...state,
            workspaceInitialized: true,
            dependenciesInstalled: true,
            bootstrapStatus:
              state.bootstrapStatus === 'error'
                ? 'deps-ready'
                : this.maxBootstrapStatus(state.bootstrapStatus, 'deps-ready'),
            lastBootstrapAt: new Date().toISOString(),
            bootstrapError: '前端服务已启动但预览服务未在超时内就绪'
          }
    )

    return {
      previewReady,
      previewUrl,
      warning: previewReady
        ? undefined
        : `前端服务已启动但尚未就绪，可稍后重试或查看日志: ${FRONTEND_STARTUP_LOG_PATH}`,
      state: nextState
    }
  }

  /**
   * 可选执行构建校验
   */
  async ensureBuildReady(
    sandbox: SandboxData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState,
    options?: FrontendBuildValidationOptions
  ): Promise<FrontendBootstrapState> {
    const state = currentState || (await this.readBootstrapState(sandbox))

    if (state.buildValidated && !options?.force) {
      return this.writeBootstrapState(sandbox, {
        ...state,
        bootstrapStatus: 'build-ready',
        lastBootstrapAt: new Date().toISOString(),
        bootstrapError: undefined
      })
    }

    const result = await dockerService.execCommand(sandbox.primaryContainerId!, {
      command: template.buildCommand,
      workdir: sandbox.frontend!.projectRoot,
      timeout: FRONTEND_INSTALL_TIMEOUT_SECONDS
    })

    if (!result || result.exitCode !== 0) {
      throw new Error(
        this.buildExecErrorMessage('执行项目构建失败', result?.stdout, result?.stderr)
      )
    }

    return this.writeBootstrapState(sandbox, {
      ...state,
      workspaceInitialized: true,
      dependenciesInstalled: true,
      buildValidated: true,
      bootstrapStatus: 'build-ready',
      lastBootstrapAt: new Date().toISOString(),
      bootstrapError: undefined
    })
  }

  /**
   * 读取 bootstrap 状态
   */
  async readBootstrapState(sandbox: SandboxData): Promise<FrontendBootstrapState> {
    if (!sandbox.frontend || !sandbox.primaryContainerId) {
      return { ...DEFAULT_BOOTSTRAP_STATE }
    }

    const fromWorkspace = await this.readBootstrapStateFromWorkspace(sandbox)
    const inferred = await this.inferBootstrapState(sandbox)

    return this.mergeBootstrapStates(
      this.extractMetadataBootstrapState(sandbox),
      inferred,
      fromWorkspace
    )
  }

  /**
   * 写入 bootstrap 状态
   */
  async writeBootstrapState(
    sandbox: SandboxData,
    state: FrontendBootstrapState
  ): Promise<FrontendBootstrapState> {
    if (!sandbox.frontend) {
      throw new Error('前端工作区元数据不存在')
    }

    sandbox.frontend.bootstrapStatus = state.bootstrapStatus
    sandbox.frontend.workspaceInitialized = state.workspaceInitialized
    sandbox.frontend.dependenciesInstalled = state.dependenciesInstalled
    sandbox.frontend.buildValidated = state.buildValidated
    sandbox.frontend.lastBootstrapAt = state.lastBootstrapAt
    sandbox.frontend.bootstrapError = state.bootstrapError

    const saveResult = sandboxService.saveSandbox(sandbox)
    if (!saveResult.success) {
      throw new Error(saveResult.error || '保存前端 bootstrap 元数据失败')
    }

    const writeResult = await sandboxFileService.writeProjectFiles(
      sandbox.sandboxId,
      [
        {
          path: FRONTEND_BOOTSTRAP_STATE_FILE,
          content: JSON.stringify(state, null, 2)
        }
      ],
      sandbox.frontend.projectRoot
    )

    if (!writeResult.success) {
      throw new Error(writeResult.error || '写入前端 bootstrap 状态文件失败')
    }

    return state
  }

  private extractMetadataBootstrapState(sandbox: SandboxData): FrontendBootstrapState {
    const frontend = sandbox.frontend

    return {
      bootstrapStatus: frontend?.bootstrapStatus || 'pending',
      workspaceInitialized: frontend?.workspaceInitialized || false,
      dependenciesInstalled: frontend?.dependenciesInstalled || false,
      buildValidated: frontend?.buildValidated || false,
      lastBootstrapAt: frontend?.lastBootstrapAt,
      bootstrapError: frontend?.bootstrapError
    }
  }

  private async readBootstrapStateFromWorkspace(
    sandbox: SandboxData
  ): Promise<FrontendBootstrapState | null> {
    const result = await dockerService.execCommand(sandbox.primaryContainerId!, {
      command: `if [ -f ${this.quoteShell(this.resolveWorkspacePath(FRONTEND_BOOTSTRAP_STATE_FILE, sandbox))} ]; then cat ${this.quoteShell(this.resolveWorkspacePath(FRONTEND_BOOTSTRAP_STATE_FILE, sandbox))}; fi`,
      workdir: sandbox.frontend!.projectRoot,
      timeout: 10
    })

    const content = result?.stdout?.trim()
    if (!content) {
      return null
    }

    try {
      return this.normalizeBootstrapState(JSON.parse(content) as Partial<FrontendBootstrapState>)
    } catch (error) {
      logger.warn('解析前端 bootstrap 状态文件失败，将回退为推断状态', 'main', {
        sandboxId: sandbox.sandboxId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private async inferBootstrapState(sandbox: SandboxData): Promise<FrontendBootstrapState> {
    const workspaceInitialized = await this.pathExists(sandbox, 'package.json')
    const dependenciesInstalled = await this.pathExists(sandbox, 'node_modules')

    return this.normalizeBootstrapState({
      bootstrapStatus: dependenciesInstalled
        ? 'deps-ready'
        : workspaceInitialized
          ? 'workspace-ready'
          : 'pending',
      workspaceInitialized,
      dependenciesInstalled,
      buildValidated: false
    })
  }

  private mergeBootstrapStates(
    ...states: Array<FrontendBootstrapState | null | undefined>
  ): FrontendBootstrapState {
    return states.reduce<FrontendBootstrapState>(
      (merged, current) => {
        if (!current) {
          return merged
        }

        const normalized = this.normalizeBootstrapState(current)
        const nextStatus =
          normalized.bootstrapStatus === 'error'
            ? merged.bootstrapStatus === 'error'
              ? 'error'
              : normalized.bootstrapStatus
            : this.maxBootstrapStatus(merged.bootstrapStatus, normalized.bootstrapStatus)

        return {
          bootstrapStatus: nextStatus,
          workspaceInitialized: merged.workspaceInitialized || normalized.workspaceInitialized,
          dependenciesInstalled: merged.dependenciesInstalled || normalized.dependenciesInstalled,
          buildValidated: merged.buildValidated || normalized.buildValidated,
          lastBootstrapAt: normalized.lastBootstrapAt || merged.lastBootstrapAt,
          bootstrapError: normalized.bootstrapError || merged.bootstrapError
        }
      },
      { ...DEFAULT_BOOTSTRAP_STATE }
    )
  }

  private normalizeBootstrapState(
    state: Partial<FrontendBootstrapState> | null | undefined
  ): FrontendBootstrapState {
    return {
      bootstrapStatus: state?.bootstrapStatus || 'pending',
      workspaceInitialized: state?.workspaceInitialized || false,
      dependenciesInstalled: state?.dependenciesInstalled || false,
      buildValidated: state?.buildValidated || false,
      lastBootstrapAt: state?.lastBootstrapAt,
      bootstrapError: state?.bootstrapError
    }
  }

  private maxBootstrapStatus(
    current: FrontendBootstrapStatus,
    next: FrontendBootstrapStatus
  ): FrontendBootstrapStatus {
    const currentIndex = BOOTSTRAP_STATUS_ORDER.indexOf(current)
    const nextIndex = BOOTSTRAP_STATUS_ORDER.indexOf(next)
    return nextIndex > currentIndex ? next : current
  }

  private async pathExists(sandbox: SandboxData, relativePath: string): Promise<boolean> {
    const result = await dockerService.execCommand(sandbox.primaryContainerId!, {
      command: `[ -e ${this.quoteShell(this.resolveWorkspacePath(relativePath, sandbox))} ]`,
      workdir: sandbox.frontend!.projectRoot,
      timeout: 10
    })

    return !!result && result.exitCode === 0
  }

  private resolveWorkspacePath(relativePath: string, sandbox: SandboxData): string {
    const projectRoot = sandbox.frontend!.projectRoot.replace(/\/+$/, '')
    const normalized = relativePath.replace(/^\/+/, '')
    return `${projectRoot}/${normalized}`
  }

  private quoteShell(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
  }

  private buildExecErrorMessage(prefix: string, stdout?: string, stderr?: string): string {
    const details = (stdout || stderr || '').trim()
    return details ? `${prefix}: ${details}` : prefix
  }
}

export const frontendWorkspaceBootstrapService = new FrontendWorkspaceBootstrapService()
