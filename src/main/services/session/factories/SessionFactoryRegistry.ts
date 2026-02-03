import { SessionFactory } from './SessionFactory'
import { SessionType } from '@main/types/session'
import { DefaultSessionFactory } from './DefaultSessionFactory'
import { ToolSessionFactory } from './ToolSessionFactory'
import { KnowledgeSessionFactory } from './KnowledgeSessionFactory'

/**
 * 会话工厂注册表
 * 管理所有工厂实例，根据类型获取对应工厂
 */
export class SessionFactoryRegistry {
  private static instance: SessionFactoryRegistry
  private factories: Map<SessionType, SessionFactory>

  private constructor() {
    this.factories = new Map()
    this.registerDefaultFactories()
  }

  static getInstance(): SessionFactoryRegistry {
    if (!SessionFactoryRegistry.instance) {
      SessionFactoryRegistry.instance = new SessionFactoryRegistry()
    }
    return SessionFactoryRegistry.instance
  }

  private registerDefaultFactories(): void {
    this.register(new DefaultSessionFactory())
    this.register(new ToolSessionFactory())
    this.register(new KnowledgeSessionFactory())
  }

  register(factory: SessionFactory): void {
    this.factories.set(factory.getType(), factory)
  }

  getFactory(type: SessionType): SessionFactory {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`未找到类型为 ${type} 的会话工厂`)
    }
    return factory
  }

  getFactoryOrDefault(type?: SessionType): SessionFactory {
    if (!type) {
      return this.getFactory('default')
    }
    return this.getFactory(type)
  }
}
