import type { SessionData, SessionResourceRef, SessionType } from '@main/types/session'

/**
 * 会话工厂接口
 * 定义创建会话的契约
 * 所有会话工厂必须实现此接口
 */
export interface SessionFactory {
  /**
   * 创建会话对象
   * @param title 可选的会话标题
   * @param resourceRef 可选的外部资源引用（写作会话使用，其他类型可忽略）
   * @returns 会话数据对象
   */
  create(title?: string, resourceRef?: SessionResourceRef): SessionData

  /**
   * 获取工厂类型
   * @returns 会话类型
   */
  getType(): SessionType
}
