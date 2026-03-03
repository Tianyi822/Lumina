// 知识库服务模块入口文件

export * from './KnowledgeService'
export * from './KnowledgeServiceManager'
export * from './KnowledgeToolService'
export * from './KnowledgeCoreService'
export { getKnowledgeServiceManager } from './KnowledgeServiceManager'
export { readKnowledgeBases, writeKnowledgeBases } from './KnowledgeService'
export { knowledgeToolService, KnowledgeToolService } from './KnowledgeToolService'
export {
  knowledgeCoreService,
  KnowledgeCoreService,
  type KnowledgeSearchItem,
  type KnowledgeSearchResult,
  type KnowledgeBaseItem,
  type DocumentItem
} from './KnowledgeCoreService'
