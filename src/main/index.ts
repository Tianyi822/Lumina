/**
 * Electron 主进程入口
 *
 * 目录结构:
 * - core/       应用核心模块（窗口管理、应用生命周期）
 * - services/   业务服务模块（配置管理等）
 * - ipc/        IPC 通信处理模块
 * - types/      TypeScript 类型定义
 */

import { initializeApp } from './core'

// 启动应用
initializeApp()
