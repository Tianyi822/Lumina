import { logger } from '@main/services/logger'
import type { CreateFrontendSandboxOptions, FrontendSandboxInfo } from '@shared/types/sandbox'
import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { DEFAULT_PROJECT_ROOT, normalizeProjectRoot, sandboxFileService } from '../file'
import { templateService } from '../templates'
import { ensureFrontendBaseImage } from './imageBuilder'
import { checkHttpReady, waitForHttpReady } from './waitForHttpReady'

const dockerService = getDockerService()

const DEFAULT_PORT = 5173
const INSTALL_TIMEOUT_SECONDS = 600
const PREVIEW_READY_TIMEOUT_MS = 15000

export const FRONTEND_STARTUP_LOG_PATH = '/tmp/frontend-dev.log'
export const FRONTEND_LOG_HINT = `可稍后重试，或通过 sandbox__exec_command 查看 ${FRONTEND_STARTUP_LOG_PATH}`

/**
 * 前端沙箱服务
 * 负责创建可用于运行前端项目的基础容器
 */
export class FrontendSandboxService {
  /**
   * 创建前端沙箱
   */
  async createFrontendSandbox(options: CreateFrontendSandboxOptions): Promise<FrontendSandboxInfo> {
    const {
      name,
      framework = 'vue',
      containerPort = DEFAULT_PORT,
      projectRoot: rawProjectRoot = DEFAULT_PROJECT_ROOT
    } = options
    const projectRoot = normalizeProjectRoot(rawProjectRoot)

    if (!name || !name.trim()) {
      throw new Error('沙箱名称不能为空')
    }

    if (!projectRoot) {
      throw new Error('项目根目录不在允许范围内')
    }

    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      throw new Error('容器端口必须是 1 到 65535 之间的整数')
    }

    let containerId: string | null = null
    let sandboxId: string | null = null

    try {
      const imageId = await ensureFrontendBaseImage()
      const containerName = this.buildContainerName(name)

      const containerResult = await dockerService.createContainerFromImage({
        imageId,
        name: containerName,
        ports: [{ containerPort, protocol: 'tcp' }],
        workingDir: projectRoot
      })

      if (!containerResult.success || !containerResult.containerId) {
        throw new Error(containerResult.error || '创建前端容器失败')
      }

      containerId = containerResult.containerId

      const details = await dockerService.getContainerDetails(containerId)
      const boundPort = details?.ports.find(
        (item) => item.containerPort === containerPort && item.protocol === 'tcp'
      )
      const hostPort = boundPort?.hostPort

      if (!hostPort) {
        throw new Error('未找到容器端口映射')
      }

      const createResult = await sandboxService.createSandbox({
        name,
        creationType: 'dockerfile'
      })

      if (!createResult.success || !createResult.sandbox) {
        throw new Error(createResult.error || '创建沙箱元数据失败')
      }

      sandboxId = createResult.sandbox.sandboxId

      const sandbox = createResult.sandbox
      const previewUrl = `http://localhost:${hostPort}`
      sandbox.containerIds = [containerId]
      sandbox.primaryContainerId = containerId
      sandbox.status = 'running'
      sandbox.frontend = {
        framework,
        projectRoot,
        containerPort,
        hostPort,
        previewUrl
      }

      const saveResult = sandboxService.saveSandbox(sandbox)
      if (!saveResult.success) {
        throw new Error(saveResult.error || '保存前端沙箱元数据失败')
      }

      const template = templateService.renderTemplate(framework, {
        projectName: this.buildProjectName(name)
      })
      const writeResult = await sandboxFileService.writeProjectFiles(
        sandboxId,
        template.files,
        projectRoot
      )
      if (!writeResult.success) {
        throw new Error(writeResult.error || '初始化项目模板失败')
      }

      if (options.installDependencies !== false) {
        const installResult = await dockerService.execCommand(containerId, {
          command: template.installCommand,
          workdir: projectRoot,
          timeout: INSTALL_TIMEOUT_SECONDS
        })

        if (!installResult || installResult.exitCode !== 0) {
          throw new Error(
            this.buildExecErrorMessage(
              '安装项目依赖失败',
              installResult?.stdout,
              installResult?.stderr
            )
          )
        }
      }

      if (options.autoStart !== false) {
        const startResult = await dockerService.execCommand(containerId, {
          command: `nohup ${template.startCommand} > ${FRONTEND_STARTUP_LOG_PATH} 2>&1 &`,
          workdir: projectRoot,
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
      }

      const previewReady =
        options.autoStart !== false
          ? await waitForHttpReady(previewUrl, PREVIEW_READY_TIMEOUT_MS)
          : false
      const message = this.buildPreviewMessage(options.autoStart !== false, previewReady)

      if (!previewReady && options.autoStart !== false) {
        logger.warn('前端预览服务尚未就绪', 'main', {
          sandboxId,
          previewUrl,
          startupLogPath: FRONTEND_STARTUP_LOG_PATH
        })
      }

      logger.info('前端沙箱创建成功', 'main', {
        sandboxId,
        framework,
        containerId: containerId.substring(0, 12),
        hostPort
      })

      return {
        sandboxId,
        name: sandbox.name,
        framework,
        containerId,
        projectRoot,
        containerPort,
        hostPort,
        previewUrl,
        previewReady,
        startupLogPath: FRONTEND_STARTUP_LOG_PATH,
        message,
        status: 'running'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建前端沙箱失败', 'main', {
        name,
        framework,
        sandboxId,
        containerId,
        error: errorMessage
      })

      if (sandboxId) {
        const sandbox = sandboxService.loadSandbox(sandboxId)
        if (sandbox) {
          sandbox.status = 'error'
          sandboxService.saveSandbox(sandbox)
        }
      }

      if (containerId && !sandboxId) {
        await dockerService.removeContainer(containerId, true).catch(() => {})
      }

      throw error
    }
  }

  /**
   * 获取前端沙箱的预览地址
   */
  getPreviewUrl(sandboxId: string): string | null {
    const sandbox = sandboxService.loadSandbox(sandboxId)
    return sandbox?.frontend?.previewUrl || null
  }

  /**
   * 获取前端预览状态
   */
  async getPreviewInfo(
    sandboxId: string,
    waitTimeoutMs: number = 0
  ): Promise<Pick<
    FrontendSandboxInfo,
    'previewUrl' | 'previewReady' | 'startupLogPath' | 'message'
  > | null> {
    const sandbox = sandboxService.loadSandbox(sandboxId)
    const previewUrl = sandbox?.frontend?.previewUrl

    if (!previewUrl) {
      return null
    }

    const previewReady =
      waitTimeoutMs > 0
        ? await waitForHttpReady(previewUrl, waitTimeoutMs, 500)
        : await checkHttpReady(previewUrl)

    return {
      previewUrl,
      previewReady,
      startupLogPath: FRONTEND_STARTUP_LOG_PATH,
      message: previewReady ? undefined : `预览服务尚未就绪，${FRONTEND_LOG_HINT}`
    }
  }

  /**
   * 生成容器名称
   */
  private buildContainerName(name: string): string {
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)

    return `sandbox-frontend-${sanitized || 'app'}-${Date.now()}`
  }

  /**
   * 生成模板项目名
   */
  private buildProjectName(name: string): string {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '-')
        .replace(/^-+|-+$/g, '') || 'sandbox-app'
    )
  }

  /**
   * 构建命令执行错误消息
   */
  private buildExecErrorMessage(prefix: string, stdout?: string, stderr?: string): string {
    const details = (stdout || stderr || '').trim()
    return details ? `${prefix}: ${details}` : prefix
  }

  /**
   * 构建预览状态提示
   */
  private buildPreviewMessage(autoStarted: boolean, previewReady: boolean): string | undefined {
    if (!autoStarted) {
      return '开发服务器未自动启动，请稍后手动执行启动命令'
    }

    if (!previewReady) {
      return `沙箱已创建，但预览服务尚未就绪，${FRONTEND_LOG_HINT}`
    }

    return undefined
  }
}
