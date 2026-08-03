import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerLuminaProtocol } from './protocol'
import icon from '../../../resources/icon.png?asset'
import {
  registerAllIpcHandlers,
  initializeConfig,
  initializeLogger,
  initializeMCP,
  initializeEmbedding,
  initializeKnowledge,
  initializeEmbeddingModels,
  initializeFileService,
  initializeWriterService,
  initializeSessionService,
  initializeSyncService
} from '@main/ipc'
import { mcpService } from '@main/services/mcp'
import { getKnowledgeMCPServerService } from '@main/services/knowledge/KnowledgeMCPServerService'
import { toolStatsCollector } from '@main/services/chat/tools/ToolStatsCollector'
import { logger } from '@main/services/logger'
import { updateService } from '@main/services/update'
import { paperTranslationService } from '@main/services/paper'
import { startEventLoopMonitoring } from '@main/services/monitoring/eventLoopMonitor'
import { writerService } from '@main/services/writer'
import { handleWriterWindowClose } from '@main/services/writer/WriterFlushCoordinator'
import { initializeSessionSyncService } from '@main/services/sync/session'

const appDisplayName = 'Lumina'
const SHUTDOWN_TASK_TIMEOUT_MS = 5_000

let shutdownPromise: Promise<void> | null = null

/**
 * 创建超时任务辅助函数
 * 用于优雅退出时，确保每个清理任务不会无限阻塞退出流程
 * @param taskName - 任务名称（用于日志标识）
 * @returns 包含超时 promise 和清除函数的对象
 */
function createTimeoutPromise(taskName: string): {
  promise: Promise<void>
  clear: () => void
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const promise = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      logger.warn('退出清理任务超时，继续退出应用', 'main', {
        taskName,
        timeoutMs: SHUTDOWN_TASK_TIMEOUT_MS
      })
      resolve()
    }, SHUTDOWN_TASK_TIMEOUT_MS)
    timeoutId.unref?.()
  })

  return {
    promise,
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
  }
}

/**
 * 执行单个退出清理任务，带超时保护
 * @param taskName - 任务名称
 * @param task - 清理任务函数
 */
async function runShutdownTask(taskName: string, task: () => Promise<void> | void): Promise<void> {
  const timeout = createTimeoutPromise(taskName)

  try {
    await Promise.race([Promise.resolve().then(task), timeout.promise])
  } catch (err) {
    logger.error('退出清理任务失败', 'main', {
      taskName,
      error: err instanceof Error ? err.message : String(err)
    })
  } finally {
    timeout.clear()
  }
}

/**
 * 请求应用退出，执行并行清理后退出
 * 避免重复调用，确保只执行一次退出流程
 * @param exitCode - 退出码
 * @param reason - 退出原因描述
 */
function requestShutdown(exitCode: number, reason: string): void {
  if (shutdownPromise) {
    return
  }

  shutdownPromise = (async () => {
    logger.info('应用退出清理开始', 'main', { reason, exitCode })

    const knowledgeMCPService = getKnowledgeMCPServerService()
    const knowledgeMCPStatus = knowledgeMCPService.getStatus()

    await Promise.all([
      runShutdownTask('tool-stats', () => toolStatsCollector.stopPersist()),
      runShutdownTask('paper-translation', () => paperTranslationService.flushPendingCaches()),
      runShutdownTask('mcp', () => mcpService.disconnectAll()),
      runShutdownTask('knowledge-mcp', async () => {
        if (knowledgeMCPStatus.running) {
          await knowledgeMCPService.stop()
        }
      }),
      runShutdownTask('writer', async () => {
        await writerService.requestRendererFlush()
        await writerService.flushPendingSaves()
      })
    ])

    logger.info('应用退出清理完成', 'main', { reason, exitCode })
  })().finally(() => {
    app.exit(exitCode)
  })
}

/** 创建受统一退出流程保护的应用窗口 */
function createApplicationWindow(): BrowserWindow {
  const window = createMainWindow()
  window.on('close', (event) => {
    handleWriterWindowClose(event, {
      isShutdownRequested: () => shutdownPromise !== null,
      isQuittingForUpdate: () => updateService.isQuittingForUpdate,
      requestShutdown: () => requestShutdown(0, 'window-close')
    })
  })
  return window
}

/**
 * 初始化应用
 * 设置应用的生命周期和启动流程
 */
export function initializeApp(): void {
  // 设置应用名称，必须在 ready 之前调用，确保 macOS 菜单栏显示正确
  app.setName(appDisplayName)

  // 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
  app.whenReady().then(async () => {
    // 为 Windows 设置应用用户模型 ID
    electronApp.setAppUserModelId('com.lumina.app')

    if (process.platform === 'darwin') {
      app.dock?.setIcon(icon)
    }

    // 开发环境下默认按 F12 打开或关闭开发者工具
    // 生产环境下忽略 CommandOrControl + R
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 初始化日志系统，优先初始化以便记录后续日志
    initializeLogger()

    // 启动事件循环延迟监控（依赖 logger）
    startEventLoopMonitoring()

    // 初始化配置，即使失败也不阻止应用启动
    initializeConfig()

    // 注册 lumina:// 自定义协议（必须在 ready 后、窗口创建前）
    registerLuminaProtocol()

    // 注册所有 IPC 处理程序
    registerAllIpcHandlers()

    // 初始化会话服务（迁移旧 JSON、恢复 tmp、就绪 index）；失败不阻止应用启动
    try {
      await initializeSessionService()
    } catch (error) {
      logger.error('会话服务初始化失败，会话功能不可用', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    // 初始化 MCP 服务
    initializeMCP()

    // 初始化嵌入服务，用于知识库
    initializeEmbedding()

    // 初始化嵌入模型管理服务
    initializeEmbeddingModels()

    // 初始化知识库服务
    initializeKnowledge()

    // 初始化文件服务，并修复历史论文资源池数据
    await initializeFileService()

    // 初始化写作服务（依赖通用文件服务已完成启动）
    await initializeWriterService()

    // 初始化数据同步服务：恢复本地身份并后台续期，失败不阻止应用启动
    initializeSyncService()
      .catch((error) => {
        logger.warn('同步服务初始化失败', 'main', {
          error: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        initializeSessionSyncService()
      })

    // 创建主窗口
    const mainWindow = createApplicationWindow()

    // 初始化更新服务（需要主窗口引用来推送状态）
    updateService.setMainWindow(mainWindow)

    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，通常会重新创建一个窗口
    app.on('activate', function () {
      if (!shutdownPromise && BrowserWindow.getAllWindows().length === 0) {
        createApplicationWindow()
      }
    })
  })

  // 当所有窗口都关闭时退出应用。macOS 也不保留后台驻留。
  app.on('window-all-closed', () => {
    requestShutdown(0, 'window-all-closed')
  })

  app.on('before-quit', (e) => {
    if (updateService.isQuittingForUpdate) {
      return
    }
    e.preventDefault()
    requestShutdown(0, 'before-quit')
  })

  process.on('SIGINT', () => {
    requestShutdown(130, 'SIGINT')
  })

  process.on('SIGTERM', () => {
    requestShutdown(143, 'SIGTERM')
  })
}
