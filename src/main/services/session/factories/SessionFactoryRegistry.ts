import { SessionFactory } from './SessionFactory'
import { SessionType } from '@main/types/session'
import { DefaultSessionFactory } from './DefaultSessionFactory'
import { ToolSessionFactory } from './ToolSessionFactory'
import { KnowledgeSessionFactory } from './KnowledgeSessionFactory'
import { PaperSessionFactory } from './PaperSessionFactory'

/**
 * 会话工厂注册表
 * 管理所有工厂实例，根据类型获取对应工厂
 * 使用单例模式确保全局只有一个注册表实例
 */
export class SessionFactoryRegistry {
  private static instance: SessionFactoryRegistry
  private factories: Map<SessionType, SessionFactory>

  private constructor() {
    this.factories = new Map()
    this.registerDefaultFactories()
  }

  /**
   * 获取注册表单例
   */
  static getInstance(): SessionFactoryRegistry {
    if (!SessionFactoryRegistry.instance) {
      SessionFactoryRegistry.instance = new SessionFactoryRegistry()
    }
    return SessionFactoryRegistry.instance
  }

  /**
   * 注册默认的会话工厂
   * 注册 default、tool、knowledge、paper 四种内置工厂
   */
  private registerDefaultFactories(): void {
    this.register(new DefaultSessionFactory())
    this.register(new ToolSessionFactory())
    this.register(new KnowledgeSessionFactory())
    this.register(new PaperSessionFactory())
  }

  /**
   * 注册新的会话工厂
   * @param factory 会话工厂实例
   */
  register(factory: SessionFactory): void {
    this.factories.set(factory.getType(), factory)
  }

  /**
   * 根据类型获取会话工厂
   * @param type 会话类型
   * @throws 当找不到对应工厂时抛出错误
   */
  getFactory(type: SessionType): SessionFactory {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`未找到类型为 ${type} 的会话工厂`)
    }
    return factory
  }

  /**
   * 获取会话工厂，如果未指定类型则返回默认工厂
   * @param type 可选会话类型
   */
  getFactoryOrDefault(type?: SessionType): SessionFactory {
    if (!type) {
      return this.getFactory('default')
    }
    return this.getFactory(type)
  }
}
