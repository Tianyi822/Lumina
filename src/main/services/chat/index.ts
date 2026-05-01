// 聊天服务类入口文件

import { ChatService } from './ChatService'

export { ChatService } from './ChatService'
export { PlanExecuteService } from './PlanExecuteService'
export type { PlanExecuteServiceOptions } from './PlanExecuteService'
export * from './message'
export * from './tools'

// 全局聊天服务实例
export const chatService = new ChatService()
