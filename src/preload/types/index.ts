// 从 @electron-toolkit/preload 导入 ElectronAPI
import type { ElectronAPI } from '@electron-toolkit/preload'

// 导出各模块类型
export * from './config'
export * from './chat'
export * from './session'
export * from './mcp'
export * from './logger'
export * from './window'
export * from './embedding'
export * from './knowledge'
export * from './file'
export * from './lab'
export * from './knowledgeMCP'
export * from './document'
export * from './paper'
export * from './toolStats'
export * from './paperWebSearch'
export * from './customApi'

// 全局 Window 接口声明
declare global {
  interface Window {
    electron: ElectronAPI
    api: import('./customApi').CustomApi
  }
}
