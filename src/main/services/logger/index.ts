import { Logger } from './Logger'

// 导出类型
export { Logger } from './Logger'
export * from './loggerPaths'

// 创建并导出全局 logger 实例
export const logger = new Logger()
