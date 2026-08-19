import { SessionService } from './SessionService'

// 会话服务单例实例
export const sessionService = new SessionService()

/** 初始化会话服务（应用启动序列调用） */
export async function initializeSessionService(): Promise<void> {
  await sessionService.initialize()
}

export * from './sessionPaths'
export * from './factories'
