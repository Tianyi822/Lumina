// 聊天服务类入口文件

import { ChatService } from './ChatService'

/** @public 聊天服务对外公共 API（保留 re-export 作为稳定导出表面） */
export { ChatService } from './ChatService'
/** @public 规划执行服务对外公共 API（保留 re-export 作为稳定导出表面） */
export { PlanExecuteService } from './PlanExecuteService'
/** @public 规划执行服务构造选项（保留 re-export 作为稳定导出表面） */
export type { PlanExecuteServiceOptions } from './PlanExecuteService'

// 全局聊天服务实例
export const chatService = new ChatService()
