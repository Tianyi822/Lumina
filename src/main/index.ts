/**
 * Electron 主进程入口文件
 *
 * 目录结构:
 * - core/       应用核心模块，包括窗口管理和应用生命周期
 * - services/   业务服务模块，包括配置管理、聊天服务、知识库服务等
 * - ipc/        IPC 通信处理模块，负责主进程和渲染进程之间的通信
 * - types/      TypeScript 类型定义
 */

import { execFileSync } from 'child_process'

// 将 Windows 控制台代码页设置为 UTF-8 (65001)，避免中文乱码
// 在 dev 模式下 stdout 被 electron-vite 管道捕获时尤其重要
if (process.platform === 'win32') {
  try {
    execFileSync('chcp.com', ['65001'], { windowsHide: true, stdio: 'ignore' })
  } catch {
    // 如果 chcp.com 不可用，静默失败，日志系统稍后会处理编码
  }
}

import { initializeApp } from './core'

// 启动应用
initializeApp()
