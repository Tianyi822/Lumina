# 知识库文档删除索引逻辑修复设计

## 背景

当前知识库中取消关联文档后，前端会先调用文件取消关联，再调用
`knowledge.removeFileIndex` 删除该文件的向量块，随后还会提示用户是否重新索引整个知识库。
这会把一个文件级删除操作升级成整库重建，既耗时，也容易让用户误以为删除文档后必须重建所有文档。

正确行为是：删除或取消关联某个文档时，只删除该文档在相关知识库中的向量数据。其他文档的索引应保持不变。

## 目标

- 取消关联知识库文档时，只删除该文件在目标知识库中的向量块。
- 删除被知识库引用的文件时，只删除该文件在所有关联知识库中的向量块。
- 向量删除失败时阻止取消关联或文件删除，避免残留不可见但仍可检索的脏向量。
- 前端不再在文档删除后提示或触发整库重新索引。
- 保留已有 Result 模式，错误通过 `{ success: false, error }` 返回。

## 非目标

- 不改变知识库全量重新索引能力。
- 不移除 `knowledge:removeFileIndex` IPC；它可以继续作为显式维护入口存在。
- 不重构知识库、文件服务或向量数据库的整体架构。
- 不改变论文笔记更新导致的文件级失效与重新索引逻辑。

## 推荐方案

采用后端原子化清理方案：`FileService` 负责在修改关联元数据前删除对应向量块。
前端只调用 `file.unlinkFromKB` 或 `file.delete`，不再把向量删除和重新索引编排放在渲染进程。

这样可以把一致性规则集中在主进程：

1. 先校验文件和知识库关联关系。
2. 先删除目标文件的向量块。
3. 向量删除成功后，才更新文件元数据和知识库元数据。
4. 向量删除失败时，直接返回失败，不修改任何关联关系。

## 数据流

### 取消关联文档

```text
KnowledgeMain/FileListPanel
  -> fileStore.unlinkFileFromKB(fileId, kbId)
  -> file:unlinkFromKB
  -> FileService.unlinkFileFromKB(fileId, kbId)
  -> VectorDBService.deleteFileChunks(kbId, fileId)
  -> 更新 FileItem.usedByKBIds
  -> 更新 KnowledgeBase.linkedFileIds/documentCount/updatedAt/indexInvalidation
```

前端成功后刷新关联文件、知识库统计和侧边栏状态。取消关联成功不再调用
`knowledge.removeFileIndex`，也不再询问是否重新索引整个知识库。

### 删除文件

```text
FileManagerModal
  -> fileStore.deleteFile(fileId, forceDelete)
  -> file:delete
  -> FileService.deleteFile(fileId, forceDelete)
  -> VectorDBService.deleteFileChunks(kbId, fileId) for each usedByKBId
  -> 从所有知识库移除 linkedFileIds
  -> 删除文件元数据和上传文件实体
```

如果文件被多个知识库引用，需要先删除所有关联知识库中的该文件向量块。任一删除失败，整个删除操作失败，文件和所有知识库元数据保持不变。

## 错误处理

- `VectorDBService.deleteFileChunks` 抛错时，`FileService` 返回失败结果。
- 取消关联失败时，不修改 `usedByKBIds`、`linkedFileIds`、`documentCount` 或 `indexInvalidation`。
- 强制删除失败时，不删除文件实体，不修改任何知识库关联关系。
- 前端展示现有错误通知，用户能看到删除或取消关联失败的原因。
- 如果向量库或表不存在，`deleteFileChunks` 现有行为视为删除成功，因为没有可清理的脏数据。

## 前端行为

- 取消关联确认文案调整为“将从知识库移除该文档，并删除对应索引”一类的准确描述。
- 成功后只刷新文件列表、统计信息和知识库状态。
- 不再弹出“是否立即重新索引知识库”的二次确认。
- 不再在取消关联成功后直接调用 `window.api.knowledge.removeFileIndex`。

## 影响范围

- `src/main/services/file/FileService.ts`
  - 收紧 `unlinkFileFromKB` 的执行顺序。
  - 收紧 `removeFileAtIndex` 中强制删除被知识库引用文件的执行顺序。
  - 把按文件删除向量块的失败从 warn-and-continue 改为 fail-fast。
- `src/renderer/src/components/knowledge/hooks/useKnowledgeFiles.ts`
  - 移除取消关联后的显式 `knowledge.removeFileIndex` 调用。
  - 移除取消关联后的整库重新索引提示。
  - 调整确认文案。
- `src/renderer/src/stores/knowledgeStore.ts`
  - `unlinkFileFromKB` 同步移除本地知识库状态中该文件对应的 `indexInvalidation.files` 条目；如果移除后没有剩余失效文件，则清空 `indexInvalidation`。

## 测试计划

优先补充 `src/main/services/file/FileService.test.ts`：

1. 取消关联成功时，会删除目标知识库中该文件的向量块，并清理文件关联、知识库关联和该文件的失效状态。
2. 取消关联删除向量失败时，返回失败，文件仍保留在 `usedByKBIds`，知识库仍保留 `linkedFileIds` 和原 `documentCount`。
3. 强制删除被多个知识库引用的文件时，若任一知识库的向量删除失败，文件不删除，所有关联元数据不变。

前端验证以类型检查和人工交互验证为主，重点确认取消关联路径不再调用 `knowledge.removeFileIndex` 且不再触发 `onReindex`。如果现有测试基础可以低成本覆盖 hook 或组件行为，再补充对应前端测试。

## 验收标准

- 从知识库移除一个文档时，不会触发整库重新索引。
- 被移除文档的搜索结果不再出现在该知识库中。
- 其他文档的索引不被删除或重建。
- 向量删除失败时，文档仍显示为已关联，用户收到失败提示。
- 删除被多个知识库引用的文件时，所有相关知识库仅清理该文件的向量块。
