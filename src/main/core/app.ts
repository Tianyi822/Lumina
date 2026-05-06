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

const appDisplayName = 'Lumina'

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
    createMainWindow()

    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，通常会重新创建一个窗口
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  // 当所有窗口都关闭时退出应用，macOS 除外
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
