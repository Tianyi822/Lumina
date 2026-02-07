import { SessionFactory } from './SessionFactory'
import { SessionType } from '@main/types/session'
import { DefaultSessionFactory } from './DefaultSessionFactory'
import { ToolSessionFactory } from './ToolSessionFactory'
import { KnowledgeSessionFactory } from './KnowledgeSessionFactory'

// 会话工厂注册表
// 管理所有工厂实例，根据类型获取对应工厂
// 使用单例模式确保全局只有一个注册表实例
export class SessionFactoryRegistry {
  private static instance: SessionFactoryRegistry
  private factories: Map<SessionType, SessionFactory>

  private constructor() {
    this.factories = new Map()
    this.registerDefaultFactories()
  }

  // 获取注册表单例
  static getInstance(): SessionFactoryRegistry {
    if (!SessionFactoryRegistry.instance) {
      SessionFactoryRegistry.instance = new SessionFactoryRegistry()
    }
    return SessionFactoryRegistry.instance
  }

  // 注册默认的会话工厂
  private registerDefaultFactories(): void {
    this.register(new DefaultSessionFactory())
    this.register(new ToolSessionFactory())
    this.register(new KnowledgeSessionFactory())
  }

  // 注册新的会话工厂
  register(factory: SessionFactory): void {
    this.factories.set(factory.getType(), factory)
  }

  // 根据类型获取会话工厂
  getFactory(type: SessionType): SessionFactory {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`未找到类型为 ${type} 的会话工厂`)
    }
    return factory
  }

  // 获取会话工厂，如果未指定类型则返回默认工厂
  getFactoryOrDefault(type?: SessionType): SessionFactory {
    if (!type) {
      return this.getFactory('default')
    }
    return this.getFactory(type)
  }
}
