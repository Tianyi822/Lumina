import { logger } from '@main/services/logger'
import type {
  FrontendBootstrapState,
  FrontendBootstrapStatus,
  ProjectTemplate,
  LabData
} from '@shared/types/lab'
import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'
import { labFileService } from '../file'
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
    lab: LabData,
    template: ProjectTemplate,
    options: FrontendBootstrapOptions
  ): Promise<FrontendBootstrapResult> {
    try {
      let state = await this.readBootstrapState(lab)

      state = await this.ensureWorkspaceReady(lab, template, state)

      if (options.installDependencies) {
        state = await this.ensureDependenciesReady(lab, template, state)
      }

      if (!options.autoStart) {
        return {
          previewReady: false,
          previewUrl: lab.frontend?.previewUrl,
          state
        }
      }

      return this.ensureRuntimeReady(lab, template, state)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      try {
        const currentState = await this.readBootstrapState(lab)
        await this.writeBootstrapState(lab, {
          ...currentState,
          bootstrapStatus: 'error',
          lastBootstrapAt: new Date().toISOString(),
          bootstrapError: errorMessage
        })
      } catch (stateError) {
        logger.warn('写入前端 bootstrap 错误状态失败', 'main', {
          labId: lab.labId,
          error: stateError instanceof Error ? stateError.message : String(stateError)
        })
      }

      if (options.throwOnFailure) {
        throw error
      }

      return {
        previewReady: false,
        previewUrl: lab.frontend?.previewUrl,
        warning: errorMessage,
        state: await this.readBootstrapState(lab)
      }
    }
  }

  /**
   * 确保工作区文件已就绪
   */
  async ensureWorkspaceReady(
    lab: LabData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState
  ): Promise<FrontendBootstrapState> {
    const state = currentState || (await this.readBootstrapState(lab))
    const looksInitialized =
      state.workspaceInitialized || (await this.pathExists(lab, 'package.json'))

    if (looksInitialized) {
      return this.writeBootstrapState(lab, {
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

    const writeResult = await labFileService.writeProjectFiles(
      lab.labId,
      template.files,
      lab.frontend!.projectRoot
    )

    if (!writeResult.success) {
      throw new Error(writeResult.error || '初始化项目模板失败')
    }

    return this.writeBootstrapState(lab, {
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
    lab: LabData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState
  ): Promise<FrontendBootstrapState> {
    const state = currentState || (await this.readBootstrapState(lab))
    const dependenciesReady =
      state.dependenciesInstalled || (await this.pathExists(lab, 'node_modules'))

    if (dependenciesReady) {
      return this.writeBootstrapState(lab, {
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

    const result = await dockerService.execCommand(lab.primaryContainerId!, {
      command: template.installCommand,
      workdir: lab.frontend!.projectRoot,
      timeout: FRONTEND_INSTALL_TIMEOUT_SECONDS
    })

    if (!result || result.exitCode !== 0) {
      throw new Error(
        this.buildExecErrorMessage('安装项目依赖失败', result?.stdout, result?.stderr)
      )
    }

    return this.writeBootstrapState(lab, {
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
    lab: LabData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState
  ): Promise<FrontendBootstrapResult> {
    const state = currentState || (await this.readBootstrapState(lab))
    const previewUrl = lab.frontend!.previewUrl

    if (await checkHttpReady(previewUrl)) {
      const nextState = await this.writeBootstrapState(lab, {
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

    const startResult = await dockerService.execCommand(lab.primaryContainerId!, {
      command: `nohup ${template.startCommand} > ${FRONTEND_STARTUP_LOG_PATH} 2>&1 &`,
      workdir: lab.frontend!.projectRoot,
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
      lab,
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
    lab: LabData,
    template: ProjectTemplate,
    currentState?: FrontendBootstrapState,
    options?: FrontendBuildValidationOptions
  ): Promise<FrontendBootstrapState> {
    const state = currentState || (await this.readBootstrapState(lab))

    if (state.buildValidated && !options?.force) {
      return this.writeBootstrapState(lab, {
        ...state,
        bootstrapStatus: 'build-ready',
        lastBootstrapAt: new Date().toISOString(),
        bootstrapError: undefined
      })
    }

    const result = await dockerService.execCommand(lab.primaryContainerId!, {
      command: template.buildCommand,
      workdir: lab.frontend!.projectRoot,
      timeout: FRONTEND_INSTALL_TIMEOUT_SECONDS
    })

    if (!result || result.exitCode !== 0) {
      throw new Error(
        this.buildExecErrorMessage('执行项目构建失败', result?.stdout, result?.stderr)
      )
    }

    return this.writeBootstrapState(lab, {
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
  async readBootstrapState(lab: LabData): Promise<FrontendBootstrapState> {
    if (!lab.frontend || !lab.primaryContainerId) {
      return { ...DEFAULT_BOOTSTRAP_STATE }
    }

    const fromWorkspace = await this.readBootstrapStateFromWorkspace(lab)
    const inferred = await this.inferBootstrapState(lab)

    return this.mergeBootstrapStates(
      this.extractMetadataBootstrapState(lab),
      inferred,
      fromWorkspace
    )
  }

  /**
   * 写入 bootstrap 状态
   */
  async writeBootstrapState(
    lab: LabData,
    state: FrontendBootstrapState
  ): Promise<FrontendBootstrapState> {
    if (!lab.frontend) {
      throw new Error('前端工作区元数据不存在')
    }

    lab.frontend.bootstrapStatus = state.bootstrapStatus
    lab.frontend.workspaceInitialized = state.workspaceInitialized
    lab.frontend.dependenciesInstalled = state.dependenciesInstalled
    lab.frontend.buildValidated = state.buildValidated
    lab.frontend.lastBootstrapAt = state.lastBootstrapAt
    lab.frontend.bootstrapError = state.bootstrapError

    const saveResult = labService.saveLab(lab)
    if (!saveResult.success) {
      throw new Error(saveResult.error || '保存前端 bootstrap 元数据失败')
    }

    const writeResult = await labFileService.writeProjectFiles(
      lab.labId,
      [
        {
          path: FRONTEND_BOOTSTRAP_STATE_FILE,
          content: JSON.stringify(state, null, 2)
        }
      ],
      lab.frontend.projectRoot
    )

    if (!writeResult.success) {
      throw new Error(writeResult.error || '写入前端 bootstrap 状态文件失败')
    }

    return state
  }

  private extractMetadataBootstrapState(lab: LabData): FrontendBootstrapState {
    const frontend = lab.frontend

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
    lab: LabData
  ): Promise<FrontendBootstrapState | null> {
    const result = await dockerService.execCommand(lab.primaryContainerId!, {
      command: `if [ -f ${this.quoteShell(this.resolveWorkspacePath(FRONTEND_BOOTSTRAP_STATE_FILE, lab))} ]; then cat ${this.quoteShell(this.resolveWorkspacePath(FRONTEND_BOOTSTRAP_STATE_FILE, lab))}; fi`,
      workdir: lab.frontend!.projectRoot,
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
        labId: lab.labId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private async inferBootstrapState(lab: LabData): Promise<FrontendBootstrapState> {
    const workspaceInitialized = await this.pathExists(lab, 'package.json')
    const dependenciesInstalled = await this.pathExists(lab, 'node_modules')

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

  private async pathExists(lab: LabData, relativePath: string): Promise<boolean> {
    const result = await dockerService.execCommand(lab.primaryContainerId!, {
      command: `[ -e ${this.quoteShell(this.resolveWorkspacePath(relativePath, lab))} ]`,
      workdir: lab.frontend!.projectRoot,
      timeout: 10
    })

    return !!result && result.exitCode === 0
  }

  private resolveWorkspacePath(relativePath: string, lab: LabData): string {
    const projectRoot = lab.frontend!.projectRoot.replace(/\/+$/, '')
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
