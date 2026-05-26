import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
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
  initializeLab
} from '@main/ipc'
import { sshService } from '@main/services/lab/ssh'
import { mcpService } from '@main/services/mcp'
import { getKnowledgeMCPServerService } from '@main/services/knowledge/KnowledgeMCPServerService'
import { toolStatsCollector } from '@main/services/chat/tools/ToolStatsCollector'
import { logger } from '@main/services/logger'
import { updateService } from '@main/services/update'
import { paperTranslationService } from '@main/services/paper'

const appDisplayName = 'Lumina'
const SHUTDOWN_TASK_TIMEOUT_MS = 5_000

let shutdownPromise: Promise<void> | null = null

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
      runShutdownTask('ssh', () => sshService.shutdown()),
      runShutdownTask('knowledge-mcp', async () => {
        if (knowledgeMCPStatus.running) {
          await knowledgeMCPService.stop()
        }
      })
    ])

    logger.info('应用退出清理完成', 'main', { reason, exitCode })
  })().finally(() => {
    app.exit(exitCode)
  })
}

/**
 * 初始化应用
 * 设置应用的生命周期和启动流程
 */
export function initializeApp(): void {
  // 设置应用名称，必须在 ready 之前调用，确保 macOS 菜单栏显示正确
  app.setName(appDisplayName)

  // 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
  app.whenReady().then(() => {
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

    // 初始化配置，即使失败也不阻止应用启动
    initializeConfig()

    // 注册所有 IPC 处理程序
    registerAllIpcHandlers()

    // 初始化 MCP 服务
    initializeMCP()

    // 初始化嵌入服务，用于知识库
    initializeEmbedding()

    // 初始化嵌入模型管理服务
    initializeEmbeddingModels()

    // 初始化知识库服务
    initializeKnowledge()

    // 初始化文件服务，并修复历史论文资源池数据
    initializeFileService()

    // 初始化实验室服务
    initializeLab()

    // 创建主窗口
    const mainWindow = createMainWindow()

    // 初始化更新服务（需要主窗口引用来推送状态）
    updateService.setMainWindow(mainWindow)

    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，通常会重新创建一个窗口
    app.on('activate', function () {
      if (!shutdownPromise && BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
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
