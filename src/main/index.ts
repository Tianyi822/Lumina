/**
 * Electron 主进程入口文件
 *
 * 目录结构:
 * - core/       应用核心模块，包括窗口管理和应用生命周期
 * - services/   业务服务模块，包括配置管理、聊天服务、知识库服务等
 * - ipc/        IPC 通信处理模块，负责主进程和渲染进程之间的通信
 * - types/      TypeScript 类型定义
 */

import { initializeApp } from './core'

// 启动应用
initializeApp()
