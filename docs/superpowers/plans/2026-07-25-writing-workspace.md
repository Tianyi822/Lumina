# 通用写作工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Lumina 增加一个主题化、即时渲染、支持丰富内容与可确认 AI 原位编辑的通用写作工作区，并提供本地自动保存及 Markdown、DOCX、PDF 导出。

**Architecture:** Tiptap 3/ProseMirror 的 JSON 是正文唯一权威，主进程 `WriterService` 负责原子持久化、资源和导出，Renderer 只通过 `window.api.writer` 访问数据。AI 作为 writer capability 接入现有 Chat/ReAct 管道，只能产生经双重校验的结构化建议；建议先由 ProseMirror Decoration 显示，用户接受后才以单个 Transaction 写入正文。

**Tech Stack:** Electron 40、React 19、TypeScript 6、Zustand 5、Tiptap 3、ProseMirror、KaTeX、lowlight、docx、Zod 4、node:test、electron-vite 5。

## Global Constraints

- 包管理器始终使用 `yarn`；新增依赖锁定主版本：Tiptap `^3`、lowlight `^3`、docx `^9`。
- Tiptap JSON 是正文唯一权威；Markdown 只用于输入规则和导出，不持久化为第二份正文。
- 所有异步服务与 IPC 返回 `{ success, data?, error? }`，修订冲突额外返回 `code: 'revision_conflict'`；业务错误不跨 IPC throw。
- 用户数据固定写入 `~/.lumina/writing/`；不存在 `trash/`、`revisions/`、`backups/`。
- 永久删除文档时删除 `document.json` 与整个 `assets/`；删除文件夹只把文档移到根层级。
- `revision` 只作乐观并发计数器，不保存旧内容；撤销/重做仅存在于当前 Tiptap 会话。
- 单张图片最大 20MB；只接受 PNG、JPEG、WebP、GIF；拒绝 SVG、HTML、脚本和可执行内容。
- `lumina://writing` 必须校验文档 ID、MIME、扩展名和规范化路径，并拒绝路径穿越。
- 编辑表面铺满中间区域，使用 `--sm-color-bg-canvas`，不增加纸张卡片、黑边、圆角或投影。
- CSS 只使用 Sparrow Design Token；新增颜色必须在 `lumina-dark.css` 与 `lumina-light.css` 中定义 token。
- 所有代码注释使用中文；日志使用 `@main/services/logger`，不新增 `console.log`。
- Renderer 不直接导入 Node 模块；文件、协议、导出与删除全部经 preload API。
- AI 只编辑正文，不修改独立标题；不自行扩大 cursor/selection/section/document 范围。
- AI 建议未接受前不得进入 Tiptap 文档和磁盘；目标内容变化后建议失效，不做模糊匹配或强制套用。
- 写作文档不自动加入知识库或向量索引；论文和知识库只有用户主动选择后才作为 AI 素材。
- 不增加 CSL、参考文献格式、论文模板、分页排版、任意字体字号颜色、Word 导入或协作功能。
- `.ts`/`.tsx` 测试使用 `--loader ./scripts/test/tsAliasLoader.mjs`；测试继续采用 `node:test`。
- 每个任务先验证测试失败，再写最小实现；任务结束运行列出的回归命令并单独提交。
- 每次暂存前运行 `git status --short`；只暂存当前任务 `Files` 列出的改动，不使用
  `git add .`，不覆盖或夹带工作树中的用户改动。
- 文件系统测试为每个测试创建独立 `mkdtemp` 根目录并在测试后清理，禁止并行测试共享
  `~/.lumina/writing/` 或同一个 tmp 目录。

---

## 文件结构

### Shared

- `src/shared/types/writer.ts`：文档、索引、资源、导出和 AI 操作的跨进程契约。
- `src/shared/schemas/writerSchema.ts`：文档、保存请求、AI 建议的 Zod 校验器。
- `src/shared/utils/writerText.ts`：稳定文本哈希、块文本提取和导出前规范化。

### Main

- `src/main/services/writer/writerPaths.ts`：所有写作目录与安全路径函数。
- `src/main/services/writer/WriterStorageService.ts`：索引、原子保存、迁移、修订和永久删除。
- `src/main/services/writer/WriterAssetService.ts`：图片验证、哈希去重、导入与垃圾回收。
- `src/main/services/writer/WriterDocumentMapper.ts`：Tiptap JSON 到稳定导出 AST。
- `src/main/services/writer/WriterMarkdownExporter.ts`：Markdown 与资源目录输出。
- `src/main/services/writer/WriterDocxExporter.ts`：DOCX 映射。
- `src/main/services/writer/WriterPrintExporter.ts`：打印 HTML 与 PDF。
- `src/main/services/writer/WriterFormulaRasterizer.ts`：离屏 KaTeX 公式 PNG。
- `src/main/services/writer/WriterService.ts`：服务编排、保存队列、对话上下文读取。
- `src/main/services/chat/tools/adapters/WriterToolAdapter.ts`：只产生结构化编辑建议。
- `src/main/services/chat/tools/capabilities/WriterCapability.ts`：向 CapabilityComposer 注册写作能力。
- `src/main/ipc/handlers/writerHandlers.ts`：writer IPC。

### Preload

- `src/preload/apis/writer.ts`：`window.api.writer.*` 实现。
- `src/preload/types/writer.ts`：Renderer 可见的 API 类型。

### Renderer

- `src/renderer/src/pages/WritingPage.tsx`：页面编排、编辑器与 AI 面板布局。
- `src/renderer/src/components/chrome/WriterSidebarSection.tsx`：搜索、文档/大纲、文件夹、收藏。
- `src/renderer/src/components/writer/WriterEditor.tsx`：Tiptap 实例和正文表面。
- `src/renderer/src/components/writer/extensions/`：Schema、Markdown 规则、公式、图片、脚注。
- `src/renderer/src/components/writer/toolbar/`：浮动格式栏、斜杠菜单、节点工具。
- `src/renderer/src/components/writer/suggestions/`：AI Decoration、接受/拒绝、冲突失效。
- `src/renderer/src/components/assistant/AssistantPanelShell.tsx`：论文与写作 AI 共用外壳。
- `src/renderer/src/components/writer/chat/WriterChatPanel.tsx`：独立写作会话。
- `src/renderer/src/stores/writer/writerLibraryStore.ts`：列表、文件夹、搜索和收藏。
- `src/renderer/src/stores/writer/writerSessionStore.ts`：当前文档、脏状态、修订和保存状态。
- `src/renderer/src/stores/writer/writerSuggestionStore.ts`：建议生命周期。
- `src/renderer/src/stores/writer/writerChatStore.ts`：写作聊天消息和流状态。

---

### Task 1: 安装编辑依赖并建立跨进程文档契约

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Create: `src/shared/types/writer.ts`
- Create: `src/shared/schemas/writerSchema.ts`
- Create: `src/shared/schemas/writerSchema.test.ts`
- Modify: `src/shared/types/index.ts`

**Interfaces:**
- Produces: `WriterDocument`, `WriterDocumentSummary`, `WriterIndex`, `WriterFolder`, `WriterJsonDocument`, `WriterResult<T>`, `SaveWriterDocumentRequest`, `WriterExportFormat`。
- Produces: `writerDocumentSchema.parse(value)` 与 `saveWriterDocumentRequestSchema.parse(value)`。

- [ ] **Step 1: 写失败测试**

创建 `src/shared/schemas/writerSchema.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saveWriterDocumentRequestSchema,
  writerDocumentSchema
} from './writerSchema'

const content = {
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { nodeId: 'block-1' }, content: [] }]
}

test('有效写作文档通过 Schema', () => {
  const parsed = writerDocumentSchema.parse({
    schemaVersion: 1,
    id: 'writer-12345678',
    revision: 0,
    title: '未命名文档',
    content,
    favorite: false,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  })
  assert.equal(parsed.content.type, 'doc')
})

test('保存请求拒绝负修订和非 doc 根节点', () => {
  assert.equal(
    saveWriterDocumentRequestSchema.safeParse({
      documentId: 'writer-12345678',
      expectedRevision: -1,
      title: '错误文档',
      content: { type: 'paragraph' }
    }).success,
    false
  )
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/shared/schemas/writerSchema.test.ts`

Expected: FAIL，提示找不到 `./writerSchema`。

- [ ] **Step 3: 安装依赖并实现最小契约**

Run:

```bash
yarn add @tiptap/core@^3 @tiptap/react@^3 @tiptap/pm@^3 @tiptap/starter-kit@^3 @tiptap/extension-character-count@^3 @tiptap/extension-code-block-lowlight@^3 @tiptap/extension-highlight@^3 @tiptap/extension-image@^3 @tiptap/extension-link@^3 @tiptap/extension-mathematics@^3 @tiptap/extension-placeholder@^3 @tiptap/extension-table@^3 @tiptap/extension-task-item@^3 @tiptap/extension-task-list@^3 @tiptap/extension-text-align@^3 @tiptap/extension-underline@^3 @tiptap/extension-unique-id@^3 lowlight@^3 docx@^9
```

在 `src/shared/types/writer.ts` 定义核心类型：

```ts
export interface WriterJsonMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface WriterJsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: WriterJsonNode[]
  marks?: WriterJsonMark[]
  text?: string
}

export interface WriterJsonDocument extends WriterJsonNode {
  type: 'doc'
}

export interface WriterFolder {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface WriterDocument {
  schemaVersion: number
  id: string
  revision: number
  title: string
  content: WriterJsonDocument
  folderId?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface WriterDocumentSummary {
  id: string
  revision: number
  title: string
  folderId?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface WriterIndex {
  schemaVersion: number
  folders: WriterFolder[]
  documents: WriterDocumentSummary[]
  recentDocumentIds: string[]
}

export interface WriterResult<T> {
  success: boolean
  data?: T
  error?: string
  code?: 'not_found' | 'invalid_input' | 'revision_conflict' | 'io_error'
}

export interface SaveWriterDocumentRequest {
  documentId: string
  expectedRevision: number
  title: string
  content: WriterJsonDocument
}

export type WriterExportFormat = 'markdown' | 'docx' | 'pdf'
```

在 `writerSchema.ts` 使用递归 Zod Schema，约束 ID 为
`/^writer-[a-z0-9-]{8,}$/`、标题最多 200 字符、`revision` 为非负整数、根节点必须为
`doc`。在 `src/shared/types/index.ts` 导出 `./writer`；在 `package.json` 增加：

```json
"test:writer": "node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/shared/schemas/writerSchema.test.ts"
```

- [ ] **Step 4: 运行测试和类型检查**

Run: `yarn test:writer`

Expected: PASS，2 个测试通过。

Run: `yarn typecheck`

Expected: node 与 web 两个 TypeScript project 均无错误。

- [ ] **Step 5: 提交**

```bash
git add package.json yarn.lock src/shared/types/writer.ts src/shared/types/index.ts src/shared/schemas/writerSchema.ts src/shared/schemas/writerSchema.test.ts
git commit -m "feat: 建立写作文档共享契约"
```

---

### Task 2: 实现索引、原子保存、修订冲突与永久删除

**Files:**
- Create: `src/main/services/writer/writerPaths.ts`
- Create: `src/main/services/writer/WriterStorageService.ts`
- Create: `src/main/services/writer/WriterStorageService.test.ts`
- Create: `src/main/services/writer/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 的 `WriterDocument`、`WriterIndex`、`WriterResult<T>`、`SaveWriterDocumentRequest`。
- Produces: `WriterStorageService.initialize(): Promise<WriterResult<WriterIndex>>`。
- Produces: `createDocument(title?: string): Promise<WriterResult<WriterDocument>>`。
- Produces: `listDocuments(): Promise<WriterResult<WriterIndex>>`。
- Produces: `getDocument(id: string): Promise<WriterResult<WriterDocument>>`。
- Produces: `saveDocument(request): Promise<WriterResult<WriterDocument>>`。
- Produces: `deleteDocument(id: string): Promise<WriterResult<void>>`。
- Produces: 文件夹的 create/rename/delete 与文档的 move/setFavorite。

- [ ] **Step 1: 写失败测试**

创建 `WriterStorageService.test.ts`，每个测试先删除 `getWritingRootPath()`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WriterStorageService } from './WriterStorageService'
import { getWriterDocumentDir } from './writerPaths'

test('保存使用 expectedRevision 并拒绝旧修订覆盖', async (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-storage-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  const service = new WriterStorageService({ rootPath })
  await service.initialize()
  const created = (await service.createDocument()).data!
  const first = await service.saveDocument({
    documentId: created.id,
    expectedRevision: 0,
    title: '第一版',
    content: created.content
  })
  const conflict = await service.saveDocument({
    documentId: created.id,
    expectedRevision: 0,
    title: '旧请求',
    content: created.content
  })
  assert.equal(first.data?.revision, 1)
  assert.equal(conflict.code, 'revision_conflict')
})

test('删除文件夹只移动文档，永久删除文档移除整个目录', async (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-delete-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  const service = new WriterStorageService({ rootPath })
  await service.initialize()
  const folder = (await service.createFolder('资料')).data!
  const document = (await service.createDocument('记录')).data!
  await service.moveDocument(document.id, folder.id)
  await service.deleteFolder(folder.id)
  assert.equal((await service.getDocument(document.id)).data?.folderId, undefined)
  await service.deleteDocument(document.id)
  assert.equal(existsSync(getWriterDocumentDir(document.id, rootPath)), false)
})
```

同时增加异常临时文件恢复、索引损坏重建、无效 ID、收藏排序、最近打开最多 50 项的测试。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterStorageService.test.ts`

Expected: FAIL，提示找不到 `WriterStorageService`。

- [ ] **Step 3: 实现最小存储服务**

`writerPaths.ts` 只通过 `app.getPath('home')` 和 `join` 构建路径，并提供：

```ts
export function getWritingRootPath(): string
export function getWriterIndexPath(): string
export function getWriterDocumentsPath(): string
export function getWriterDocumentDir(documentId: string, rootPath?: string): string
export function getWriterDocumentPath(documentId: string, rootPath?: string): string
export function getWriterAssetsDir(documentId: string, rootPath?: string): string
export function isValidWriterDocumentId(documentId: string): boolean
```

生产默认 rootPath 是 `getWritingRootPath()`；测试通过构造器注入独立 rootPath。
`WriterStorageService` 使用串行写队列；保存核心必须先比较修订，再写入
`document.json.tmp`，`fsync` 文件，最后 `rename`：

```ts
async saveDocument(
  request: SaveWriterDocumentRequest
): Promise<WriterResult<WriterDocument>> {
  return this.enqueueWrite(async () => {
    const currentResult = await this.getDocument(request.documentId)
    if (!currentResult.success || !currentResult.data) return currentResult
    if (currentResult.data.revision !== request.expectedRevision) {
      return { success: false, code: 'revision_conflict', error: '文档已被其他保存更新' }
    }

    const now = new Date().toISOString()
    const next = writerDocumentSchema.parse({
      ...currentResult.data,
      title: request.title.trim() || '未命名文档',
      content: request.content,
      revision: request.expectedRevision + 1,
      updatedAt: now
    })
    await this.writeDocumentAtomically(next)
    await this.upsertSummary(next)
    return { success: true, data: next }
  })
}
```

初始化顺序固定为：创建目录 → 恢复有效临时文件 → 读取/重建索引 → 对所有文档执行纯函数
Schema 迁移 → 清理无效临时文件。`deleteDocument` 必须先校验 ID 和根路径，再
`rm(documentDir, { recursive: true, force: false })`，成功后才更新索引。

更新 `test:writer`，追加 `WriterStorageService.test.ts`。

- [ ] **Step 4: 运行存储测试**

Run: `yarn test:writer`

Expected: Schema 与 Storage 全部 PASS；异常临时文件不会覆盖正式文件。

Run: `yarn typecheck:node`

Expected: 无类型错误。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/services/writer src/shared/schemas/writerSchema.ts
git commit -m "feat: 实现写作文档原子存储"
```

---

### Task 3: 实现图片资源服务与安全 lumina 协议

**Files:**
- Create: `src/main/services/writer/WriterAssetService.ts`
- Create: `src/main/services/writer/WriterAssetService.test.ts`
- Create: `src/main/core/luminaProtocolResolver.ts`
- Create: `src/main/core/luminaProtocolResolver.test.ts`
- Modify: `src/main/core/protocol.ts`
- Modify: `src/main/services/writer/index.ts`
- Modify: `src/shared/types/writer.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WriterAsset`，字段为 `assetId`, `fileName`, `relativePath`, `mimeType`, `size`,
  `sha256`, `url`。
- Produces: `importBytes(documentId, input): Promise<WriterResult<WriterAsset>>`。
- Produces: `collectGarbage(documentId, referencedPaths): Promise<WriterResult<number>>`。
- Produces: `resolveLuminaResource(url, roots): WriterProtocolResolution`，同时覆盖 paper 与
  writing；测试通过 `LuminaProtocolRoots` 注入临时根目录。

- [ ] **Step 1: 写失败测试**

在 `WriterAssetService.test.ts` 写入真实 PNG 文件头与伪 SVG：

```ts
test('PNG 按哈希去重且 SVG 被拒绝', async () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
  ])
  const first = await service.importBytes(documentId, {
    fileName: 'figure.png',
    declaredMimeType: 'image/png',
    bytes: png
  })
  const second = await service.importBytes(documentId, {
    fileName: 'copy.png',
    declaredMimeType: 'image/png',
    bytes: png
  })
  const svg = await service.importBytes(documentId, {
    fileName: 'unsafe.svg',
    declaredMimeType: 'image/svg+xml',
    bytes: Buffer.from('<svg><script>alert(1)</script></svg>')
  })
  assert.equal(first.data?.relativePath, second.data?.relativePath)
  assert.equal(svg.success, false)
})
```

在 `luminaProtocolResolver.test.ts` 验证：

```ts
test('writing 资源限制在对应 assets 目录', () => {
  const ok = resolveLuminaResource(
    'lumina://writing/writer-12345678/assets/image.png',
    roots
  )
  const traversal = resolveLuminaResource(
    'lumina://writing/writer-12345678/assets/%2e%2e/document.json',
    roots
  )
  assert.equal(ok.success, true)
  assert.equal(traversal.success, false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterAssetService.test.ts src/main/core/luminaProtocolResolver.test.ts`

Expected: FAIL，两个模块均不存在。

- [ ] **Step 3: 实现资源验证、去重和协议路由**

资源服务必须：

1. 在复制前拒绝 `bytes.byteLength > 20 * 1024 * 1024`。
2. 以 magic bytes 判断 PNG/JPEG/WebP/GIF，不信任文件名和声明 MIME。
3. 用 SHA-256 命名为 `<hash>.<ext>`，单文档内重复哈希复用同一文件。
4. 只返回 `lumina://writing/<documentId>/assets/<file>`。
5. 垃圾回收只删除当前 JSON 未引用的普通文件，忽略子目录、临时文件和越界路径。

`luminaProtocolResolver.ts` 返回判别联合：

```ts
export type WriterProtocolResolution =
  | { success: true; path: string; mimeType: string; cacheControl: string }
  | { success: false; errorCode: number; reason: string }
```

将 `protocol.ts` 改为 `protocol.handle('lumina', handler)`；paper 路由保持现有行为，writing
路由只能读取 `<writingRoot>/documents/<id>/assets/`。处理器使用 `net.fetch(pathToFileURL())`
读取文件，并返回带白名单 `Content-Type`、`X-Content-Type-Options: nosniff` 与
`Cache-Control: private, max-age=31536000, immutable` 的 Response。

更新 `test:writer` 追加两个测试文件。

- [ ] **Step 4: 运行资源、协议和论文回归测试**

Run: `yarn test:writer`

Expected: 资源与协议测试全部 PASS。

Run: `yarn test:paper`

Expected: 现有论文资源路径行为无回归。

Run: `yarn typecheck:node`

Expected: 无类型错误。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/core/protocol.ts src/main/core/luminaProtocolResolver.ts src/main/core/luminaProtocolResolver.test.ts src/main/services/writer src/shared/types/writer.ts
git commit -m "feat: 添加写作图片资源与安全协议"
```

---

### Task 4: 接通 WriterService、IPC、preload 与应用生命周期

**Files:**
- Create: `src/main/services/writer/WriterService.ts`
- Create: `src/main/services/writer/WriterFlushCoordinator.ts`
- Create: `src/main/services/writer/WriterFlushCoordinator.test.ts`
- Create: `src/main/ipc/handlers/writerValidation.ts`
- Create: `src/main/ipc/handlers/writerValidation.test.ts`
- Create: `src/main/ipc/handlers/writerHandlers.ts`
- Create: `src/preload/apis/writer.ts`
- Create: `src/preload/types/writer.ts`
- Modify: `src/main/services/writer/index.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/core/app.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/types/customApi.ts`
- Modify: `src/preload/types/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `initializeWriterService(): Promise<void>` 与 `writerService.flushPendingSaves()`。
- Produces: `writerService.requestRendererFlush()`，请求仍存活窗口立即发送最后待保存快照。
- Produces: `window.api.writer.list/create/get/save/delete/rename/move/setFavorite`。
- Produces: `window.api.writer.createFolder/renameFolder/deleteFolder/importAsset`。

- [ ] **Step 1: 写失败的 IPC 边界测试**

创建 `writerValidation.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDeleteWriterPayload,
  validateImportWriterAssetPayload
} from './writerValidation'

test('永久删除拒绝路径和空 ID', () => {
  assert.equal(validateDeleteWriterPayload('../papers'), '无效的文档 ID')
  assert.equal(validateDeleteWriterPayload(''), '无效的文档 ID')
  assert.equal(validateDeleteWriterPayload('writer-12345678'), null)
})

test('图片导入拒绝超限字节', () => {
  const result = validateImportWriterAssetPayload({
    documentId: 'writer-12345678',
    fileName: 'large.png',
    declaredMimeType: 'image/png',
    bytes: new Uint8Array(20 * 1024 * 1024 + 1)
  })
  assert.equal(result, '单张图片不能超过 20MB')
})
```

在 `WriterFlushCoordinator.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { WriterFlushCoordinator } from './WriterFlushCoordinator'

test('Renderer flush 收到确认后结束等待', async () => {
  const sent: string[] = []
  const coordinator = new WriterFlushCoordinator({
    send: (_webContentsId, channel) => sent.push(channel),
    timeoutMs: 1_500
  })
  const pending = coordinator.requestFlush([42])
  coordinator.acknowledge(42)
  await pending
  assert.deepEqual(sent, ['writer:flush-request'])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/ipc/handlers/writerValidation.test.ts src/main/services/writer/WriterFlushCoordinator.test.ts`

Expected: FAIL，提示找不到 `writerValidation` 与 `WriterFlushCoordinator`。

- [ ] **Step 3: 实现服务编排与最小 preload API**

`WriterService` 组合 Storage 与 Asset，保存请求进入单一队列。`initializeWriterService()` 在
`initializeFileService()` 后、`createMainWindow()` 前 await。`WriterFlushCoordinator` 向所有仍
存活窗口发送 `writer:flush-request`，等待 `writer:flush-ack`，单窗口最多等待 1,500ms；窗口已
销毁或超时只记录 warning。退出时增加：

```ts
runShutdownTask('writer', async () => {
  await writerService.requestRendererFlush()
  await writerService.flushPendingSaves()
})
```

`WriterApi` 明确定义：

```ts
export interface WriterApi {
  list: () => Promise<WriterResult<WriterIndex>>
  create: (title?: string) => Promise<WriterResult<WriterDocument>>
  get: (documentId: string) => Promise<WriterResult<WriterDocument>>
  save: (request: SaveWriterDocumentRequest) => Promise<WriterResult<WriterDocument>>
  delete: (documentId: string) => Promise<WriterResult<void>>
  rename: (documentId: string, title: string) => Promise<WriterResult<WriterDocument>>
  move: (documentId: string, folderId?: string) => Promise<WriterResult<WriterDocument>>
  setFavorite: (
    documentId: string,
    favorite: boolean
  ) => Promise<WriterResult<WriterDocument>>
  createFolder: (name: string) => Promise<WriterResult<WriterFolder>>
  renameFolder: (folderId: string, name: string) => Promise<WriterResult<WriterFolder>>
  deleteFolder: (folderId: string) => Promise<WriterResult<void>>
  importAsset: (
    documentId: string,
    fileName: string,
    declaredMimeType: string,
    bytes: Uint8Array
  ) => Promise<WriterResult<WriterAsset>>
  onFlushRequested: (callback: () => Promise<void> | void) => () => void
  acknowledgeFlush: () => Promise<void>
}
```

Handler 层只校验、调用服务、记录日志。Task 4 不提前暴露尚无实现的导出 API；该 API 在
Task 14 接入首个输出器时加入。更新 `test:writer` 追加验证测试。

- [ ] **Step 4: 运行测试、类型检查与构建**

Run: `yarn test:writer`

Expected: writer 测试全部 PASS。

Run: `yarn typecheck`

Expected: `window.api.writer` 在主进程、preload、Renderer 类型中一致。

Run: `yarn build`

Expected: electron-vite 三入口构建成功。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/core/app.ts src/main/ipc src/main/services/writer src/preload
git commit -m "feat: 接通写作服务与跨进程 API"
```

---

### Task 5: 新增写作导航、文档库 Store 与侧栏

**Files:**
- Create: `src/renderer/src/components/chrome/workspaceNavigation.ts`
- Create: `src/renderer/src/components/chrome/workspaceNavigation.test.ts`
- Create: `src/renderer/src/components/chrome/WriterSidebarSection.tsx`
- Create: `src/renderer/src/components/chrome/WriterSidebarSection.module.css`
- Create: `src/renderer/src/stores/writer/writerLibraryStore.ts`
- Create: `src/renderer/src/stores/writer/writerLibraryStore.test.ts`
- Create: `src/renderer/src/stores/writer/index.ts`
- Modify: `src/renderer/src/components/chrome/PrimarySidebar.tsx`
- Modify: `src/renderer/src/components/chrome/WorkspaceSidebarHost.tsx`
- Modify: `src/renderer/src/components/icons/icons/index.ts`
- Modify: `src/renderer/src/stores/uiStateStore.ts`
- Modify: `src/renderer/src/stores/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ViewMode = 'paper' | 'knowledge' | 'writer'`。
- Produces: `switchToWriterView()` 及 writer 侧栏折叠/宽度状态。
- Produces: `useWriterLibraryStore` 的 `load`, `createAndOpen`, `deletePermanently`,
  `rename`, `move`, `toggleFavorite`, `setSearchQuery`, `setSidebarMode`。

- [ ] **Step 1: 写导航和 Store 失败测试**

`workspaceNavigation.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { getWorkspaceAddLabel, WORKSPACE_NAV_ITEMS } from './workspaceNavigation'

test('写作位于一级导航并使用新建文档动作', () => {
  assert.deepEqual(
    WORKSPACE_NAV_ITEMS.map((item) => item.view),
    ['paper', 'knowledge', 'writer']
  )
  assert.equal(getWorkspaceAddLabel('writer'), '新建文档')
})
```

`writerLibraryStore.test.ts` 用最小 `window.api.writer` mock 验证：

```ts
test('createAndOpen 创建空白文档并设为当前文档', async () => {
  const created = createDocumentFixture({ id: 'writer-new-document' })
  mockWriterApi({ create: async () => ({ success: true, data: created }) })
  await useWriterLibraryStore.getState().createAndOpen()
  assert.equal(useWriterLibraryStore.getState().currentDocumentId, created.id)
  assert.equal(useWriterLibraryStore.getState().documents[0].id, created.id)
})
```

另测搜索同时匹配标题、收藏置顶但不改变更新时间顺序、永久删除失败时保留列表项。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/chrome/workspaceNavigation.test.ts src/renderer/src/stores/writer/writerLibraryStore.test.ts`

Expected: FAIL，导航模块和 Store 不存在。

- [ ] **Step 3: 实现导航、Store 与侧栏**

`workspaceNavigation.ts` 集中定义，避免 `PrimarySidebar` 再维护分散 Record：

```ts
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { id: 'read', icon: 'read', label: '阅读', view: 'paper' },
  { id: 'knowledge', icon: 'knowledge', label: '知识库', view: 'knowledge' },
  { id: 'writer', icon: 'write', label: '写作', view: 'writer' }
]

export function getWorkspaceAddLabel(view: ViewMode): string {
  if (view === 'paper') return '添加论文'
  if (view === 'knowledge') return '新增知识库'
  return '新建文档'
}
```

`uiStateStore` 新增 `writerSidebarCollapsed`, `writerSidebarWidth`,
`writerChatPanelOpen`, `writerChatPanelWidth`，并把 writer 分支加入
`isCurrentSidebarCollapsed`、`toggleCurrentSidebar`、`setCurrentView` 与 persist partialize。

`WriterSidebarSection`：

- 顶部使用现有 `SegmentedControl` 在“文档/大纲”间切换。
- 文档模式显示搜索、收藏、最近、全部和可折叠文件夹。
- 空列表显示“新建第一个文档”。
- 永久删除调用 `useNotification().confirm('此操作不可撤销。', { danger: true })`。
- 删除文件夹文案明确“文档将移回全部文档”。
- 列表超过 200 项时启用 `@tanstack/react-virtual`。

`PrimarySidebar.handleAddClick` 的 writer 分支调用
`useWriterLibraryStore.getState().createAndOpen()`；`WorkspaceSidebarHost` 渲染
`<WriterSidebarSection />`。新增 `write` SVG 图标，只用 `currentColor`。

更新 `test:writer` 追加两个测试文件。

- [ ] **Step 4: 运行测试与 Web 类型检查**

Run: `yarn test:writer`

Expected: writer 测试全部 PASS。

Run: `yarn typecheck:web`

Expected: writer ViewMode 的所有 Record 与分支完整，无遗漏联合类型错误。

- [ ] **Step 5: 提交**

```bash
git add package.json src/renderer/src/components/chrome src/renderer/src/components/icons/icons/index.ts src/renderer/src/stores
git commit -m "feat: 添加写作导航与文档侧栏"
```

---

### Task 6: 构建无纸张边框的基础编辑器与自动保存

**Files:**
- Create: `src/renderer/src/pages/WritingPage.tsx`
- Create: `src/renderer/src/pages/WritingPage.module.css`
- Create: `src/renderer/src/components/writer/WriterEditor.tsx`
- Create: `src/renderer/src/components/writer/WriterEditor.module.css`
- Create: `src/renderer/src/components/writer/writerAutosave.ts`
- Create: `src/renderer/src/components/writer/writerAutosave.test.ts`
- Create: `src/renderer/src/stores/writer/writerSessionStore.ts`
- Create: `src/renderer/src/stores/writer/writerSessionStore.test.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.module.css`
- Modify: `src/renderer/src/styles/sm-tokens.css`
- Modify: `src/renderer/src/stores/writer/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WriterAutosaveController.schedule(snapshot)`, `flush()`, `dispose()`。
- Produces: `writerSessionStore.openDocument(id)`, `markDirty()`, `applySaveResult(revision)`,
  `handleRevisionConflict()`。
- Produces: `WritingPage` 懒加载入口。

- [ ] **Step 1: 写自动保存失败测试**

`writerAutosave.test.ts` 使用注入时钟，不实际等待 600ms：

```ts
test('连续修改只保存最后快照，flush 立即等待当前保存', async () => {
  const saved: string[] = []
  const clock = createManualAutosaveClock()
  const controller = new WriterAutosaveController<string>({
    delayMs: 600,
    clock,
    save: async (value) => {
      saved.push(value)
      return { success: true }
    }
  })
  controller.schedule('a')
  controller.schedule('ab')
  clock.advance(599)
  assert.deepEqual(saved, [])
  clock.advance(1)
  await controller.flush()
  assert.deepEqual(saved, ['ab'])
})
```

`writerSessionStore.test.ts` 验证保存成功更新 revision，失败保留 dirty，冲突进入
`saveStatus: 'conflict'` 且不覆盖内存内容。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/writer/writerAutosave.test.ts src/renderer/src/stores/writer/writerSessionStore.test.ts`

Expected: FAIL，自动保存和 session Store 不存在。

- [ ] **Step 3: 实现基础页面与编辑器**

`App.tsx` 增加：

```tsx
const WritingPage = lazy(() => import('@renderer/pages/WritingPage'))
```

并在 `renderWorkspaceView` 的 writer 分支返回该页面。

`WriterEditor` 首期只启用 `StarterKit`、`Underline`、`Highlight`、`Link`、
`Placeholder`、`CharacterCount`、`UniqueID`。编辑器设置：

```ts
const editor = useEditor({
  immediatelyRender: false,
  extensions: createBaseWriterExtensions(),
  content: document.content,
  onUpdate: ({ editor }) => {
    writerSessionStore.getState().markDirty()
    autosaveController.schedule({
      title: currentTitle,
      content: editor.getJSON() as WriterJsonDocument
    })
  }
})
```

完整正文只存在于 Tiptap EditorState 和 `WriterAutosaveController` 的最后一个待保存快照中，
不按键写入 Zustand。Store 只保存文档 ID、revision、dirty/saveStatus 和必要摘要。标题是独立
`<input>`，输入同样进入 600ms 自动保存。文档切换、`window.blur`、页面卸载和应用
`beforeunload` 调用 `autosaveController.flush()`；`revision_conflict` 时停止自动重试，通知用户
重新加载。

编辑器挂载时注册退出握手：

```ts
useEffect(() => {
  return window.api.writer.onFlushRequested(async () => {
    await autosaveController.flush()
    await window.api.writer.acknowledgeFlush()
  })
}, [autosaveController])
```

这样主进程退出任务先等待 Renderer 把最后防抖快照送入 IPC，再刷新主进程保存队列；不能只
依赖浏览器 `beforeunload` 的异步调用。

布局必须满足：

```css
.page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--sm-color-bg-canvas);
}

.editorSurface {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--sm-color-bg-canvas);
  color: var(--sm-color-text-primary);
}

.content {
  width: min(100%, var(--sm-writer-content-max-width));
  min-height: 100%;
  margin: 0 auto;
  padding: clamp(var(--sm-space-6), 6vw, calc(var(--sm-space-6) * 2));
}
```

在 `sm-tokens.css` 定义 `--sm-writer-content-max-width: 800px`，避免组件硬编码内容宽度。
不得在 `.editorSurface` 或 `.content` 设置 border、border-radius、box-shadow 或独立纸张背景。
Windows 顶部交互控件保留 `--sm-window-controls-safe-width` 避让。

更新 `test:writer` 追加两项测试。

- [ ] **Step 4: 运行 writer 测试、类型检查和基础人工验证**

Run: `yarn test:writer`

Expected: 自动保存与 Store 测试 PASS。

Run: `yarn typecheck:web`

Expected: 无错误。

Run: `yarn dev`

Expected: 点击“写作”与“新建文档”后可立即输入；明暗主题下中间区域均铺满主题背景，无黑边和纸张卡片；切换文档后重新打开得到最后一次成功保存内容。

- [ ] **Step 5: 提交**

```bash
git add package.json src/renderer/src/App.tsx src/renderer/src/App.module.css src/renderer/src/styles/sm-tokens.css src/renderer/src/pages/WritingPage.tsx src/renderer/src/pages/WritingPage.module.css src/renderer/src/components/writer src/renderer/src/stores/writer
git commit -m "feat: 添加写作编辑器与自动保存"
```

---

### Task 7: 完成语义富文本、Markdown 即时转换与编辑工具

**Files:**
- Create: `src/renderer/src/components/writer/extensions/createWriterExtensions.ts`
- Create: `src/renderer/src/components/writer/extensions/writerMarkdownRules.ts`
- Create: `src/renderer/src/components/writer/extensions/writerMarkdownRules.test.ts`
- Create: `src/renderer/src/components/writer/extensions/writerClipboard.ts`
- Create: `src/renderer/src/components/writer/extensions/writerClipboard.test.ts`
- Create: `src/renderer/src/components/writer/toolbar/WriterBubbleMenu.tsx`
- Create: `src/renderer/src/components/writer/toolbar/WriterSlashMenu.tsx`
- Create: `src/renderer/src/components/writer/toolbar/WriterToolbar.module.css`
- Modify: `src/renderer/src/components/writer/WriterEditor.tsx`
- Modify: `src/renderer/src/components/writer/WriterEditor.module.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `createWriterExtensions(): Extension[]`。
- Produces: `shouldApplyWriterInputRule({ composing, textBeforeCursor }): boolean`。
- Produces: `sanitizeWriterPaste(html, plainText, markdownText): WriterPastePayload`。

- [ ] **Step 1: 写输入法、Markdown 与粘贴失败测试**

```ts
test('IME composition 期间不执行 Markdown 转换', () => {
  assert.equal(
    shouldApplyWriterInputRule({ composing: true, textBeforeCursor: '# ' }),
    false
  )
  assert.equal(
    shouldApplyWriterInputRule({ composing: false, textBeforeCursor: '# ' }),
    true
  )
})

test('富文本粘贴移除字体颜色、事件和未知标签', () => {
  const payload = sanitizeWriterPaste(
    '<p style="font-size:42px;color:red" onclick="run()">正文<script>bad()</script></p>',
    '正文',
    ''
  )
  assert.doesNotMatch(payload.html, /font-size|color:|onclick|script/i)
  assert.match(payload.html, /<p>正文<\/p>/)
})
```

另测 `#` 到 `######`、引用、三种列表、任务列表、代码围栏、分隔线、粗体、斜体、删除线、
`$...$` 与独立 `$$...$$` 的规则识别。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/writer/extensions/writerMarkdownRules.test.ts src/renderer/src/components/writer/extensions/writerClipboard.test.ts`

Expected: FAIL，两个模块不存在。

- [ ] **Step 3: 实现 Schema、输入规则与按需工具**

`createWriterExtensions` 固定扩展顺序并限制 heading 1–6、taskList、textAlign 只作用于
heading/paragraph/tableCell。`UniqueID` 只为稳定块与可编辑容器生成 `nodeId`，从粘贴内容中
发现重复 ID 时重新生成。

`writerMarkdownRules` 使用 Tiptap `InputRule`，每条规则开头先检查
`view.composing || event.isComposing`。转换完成后删除触发字符，不保留源码。正文没有整篇
Markdown source mode。

`writerClipboard`：

- HTML 先经 DOMParser 删除 `script`, `style`, `iframe`, `object`, `embed` 和所有 `on*` 属性。
- 删除 `font-family`, `font-size`, `color`, `background-color` 内联样式。
- 明确存在 `text/markdown` 时走受限 Markdown Parser；否则普通文本按段落插入。
- 提供“粘贴为 Markdown”命令，使用相同解析器。

Bubble Menu 只显示粗体、斜体、下划线、删除线、语义高亮、行内代码、链接。Slash Menu
只显示首期允许块；键盘 ArrowUp/ArrowDown/Enter/Escape 可完整操作，Escape 恢复编辑器焦点。

- [ ] **Step 4: 运行测试与编辑器人工检查**

Run: `yarn test:writer`

Expected: Markdown、IME、粘贴测试全部 PASS。

Run: `yarn typecheck:web`

Expected: 无错误。

Run: `yarn dev`

Expected: 中文输入法组合文本不会被转换；输入 `# `、`- [ ] ` 和代码围栏后即时成为对应富文本；选区工具与 `/` 菜单可用键盘操作。

- [ ] **Step 5: 提交**

```bash
git add package.json src/renderer/src/components/writer
git commit -m "feat: 完善写作富文本与 Markdown 输入"
```

---

### Task 8: 添加公式与代码块

**Files:**
- Create: `src/renderer/src/components/writer/extensions/writerMath.ts`
- Create: `src/renderer/src/components/writer/extensions/writerMath.test.ts`
- Create: `src/renderer/src/components/writer/nodes/WriterMathView.tsx`
- Create: `src/renderer/src/components/writer/nodes/WriterMathView.module.css`
- Create: `src/renderer/src/components/writer/nodes/WriterCodeBlockView.tsx`
- Create: `src/renderer/src/components/writer/nodes/WriterCodeBlockView.module.css`
- Modify: `src/renderer/src/components/writer/extensions/createWriterExtensions.ts`
- Modify: `src/renderer/src/components/writer/toolbar/WriterSlashMenu.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `inlineMath` 与 `blockMath` 节点，权威属性为 `{ latex: string, nodeId: string }`。
- Produces: `renderWriterMath(latex, displayMode): WriterMathRenderResult`。
- Produces: lowlight 代码块，属性为 `{ language: string | null, nodeId: string }`。

- [ ] **Step 1: 写公式序列化和错误保留测试**

```ts
test('无效 LaTeX 保留源码并返回错误，不删除节点', () => {
  const result = renderWriterMath('\\frac{', true)
  assert.equal(result.success, false)
  assert.equal(result.latex, '\\frac{')
  assert.ok(result.error)
})

test('公式节点 JSON 只保存 LaTeX 和稳定 ID', () => {
  const json = createBlockMathJson('E = mc^2', 'math-1')
  assert.deepEqual(json, {
    type: 'blockMath',
    attrs: { latex: 'E = mc^2', nodeId: 'math-1' }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/writer/extensions/writerMath.test.ts`

Expected: FAIL，`writerMath` 不存在。

- [ ] **Step 3: 实现公式 Node View 与代码块**

`renderWriterMath` 调用 `katex.renderToString`，固定：

```ts
{
  displayMode,
  throwOnError: true,
  strict: 'warn',
  trust: false,
  output: 'htmlAndMathml'
}
```

Node View 默认只显示渲染结果；双击打开紧邻节点的小浮层，包含源码 textarea、实时预览、
错误状态、确定和取消。错误时显示主题化错误文本但继续保存原 LaTeX。公式 DOM 添加
`aria-label={latex}` 与可复制源码。

`createWriterExtensions` 把 StarterKit 的内置 codeBlock 设为 false，避免注册两个同名节点。
代码块使用 `CodeBlockLowlight`，只注册 JavaScript、TypeScript、Python、JSON、Bash、
CSS、XML、Markdown、C/C++、Java、Rust、Go。Node View 提供语言选择与复制按钮，不执行代码。

- [ ] **Step 4: 运行测试与现有 Markdown 渲染回归**

Run: `yarn test:writer`

Expected: 公式测试 PASS。

Run: `yarn test:markdown-render`

Expected: 论文聊天的 KaTeX 渲染无回归。

Run: `yarn typecheck:web`

Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add package.json src/renderer/src/components/writer
git commit -m "feat: 添加写作公式与代码块"
```

---

### Task 9: 添加图片节点、导入与会话安全清理

**Files:**
- Create: `src/renderer/src/components/writer/extensions/writerImage.ts`
- Create: `src/renderer/src/components/writer/extensions/writerImage.test.ts`
- Create: `src/renderer/src/components/writer/nodes/WriterImageView.tsx`
- Create: `src/renderer/src/components/writer/nodes/WriterImageView.module.css`
- Modify: `src/renderer/src/components/writer/extensions/createWriterExtensions.ts`
- Modify: `src/renderer/src/components/writer/WriterEditor.tsx`
- Modify: `src/renderer/src/components/writer/toolbar/WriterSlashMenu.tsx`
- Modify: `src/main/services/writer/WriterService.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: image attrs `{ src, assetPath, alt, caption, width, align, nodeId }`。
- Produces: `importWriterImage(file, documentId): Promise<WriterResult<WriterAsset>>`。
- Consumes: Task 3 的 `window.api.writer.importAsset`；垃圾回收只由主进程 WriterService 调用。

- [ ] **Step 1: 写图片属性与资源引用测试**

```ts
test('图片节点只接受 writing 协议资源并提取垃圾回收引用', () => {
  const safe = createWriterImageAttrs({
    url: 'lumina://writing/writer-12345678/assets/hash.png',
    relativePath: 'assets/hash.png'
  })
  assert.equal(safe.assetPath, 'assets/hash.png')
  assert.throws(() =>
    createWriterImageAttrs({
      url: 'https://example.com/tracker.png',
      relativePath: 'tracker.png'
    })
  )
  assert.deepEqual(
    collectReferencedWriterAssets({
      type: 'doc',
      content: [{ type: 'image', attrs: safe }]
    }),
    ['assets/hash.png']
  )
})
```

另测宽度钳制为 10–100、对齐只允许 left/center/right、空 alt 被保留以提示补充。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/writer/extensions/writerImage.test.ts`

Expected: FAIL，`writerImage` 不存在。

- [ ] **Step 3: 实现粘贴、拖放、文件选择与 Node View**

粘贴/拖放/文件选择统一执行：

```ts
const bytes = new Uint8Array(await file.arrayBuffer())
const result = await window.api.writer.importAsset(
  documentId,
  file.name,
  file.type,
  bytes
)
```

成功后以 Tiptap Transaction 替换上传占位；失败时删除占位并用 `useNotification` 显示原因。
Node View 支持 alt、caption、宽度和三种对齐，工具只在选中图片时显示。

编辑会话内不删除孤儿资源。文档关闭或应用下次启动时，
`WriterService.collectDocumentGarbage(documentId)` 读取最后成功保存的 JSON，自行提取
`referencedPaths` 后才清理未引用资源，使撤销恢复图片仍有效。Renderer 不传入删除清单。
外链图片不得进入文档 JSON。

- [ ] **Step 4: 运行测试与图片人工验证**

Run: `yarn test:writer`

Expected: 图片 Schema、导入、去重、垃圾回收测试 PASS。

Run: `yarn typecheck`

Expected: 无错误。

Run: `yarn dev`

Expected: 粘贴、拖放、选择 PNG/JPEG/WebP/GIF 可显示；SVG 与超过 20MB 文件被拒绝；撤销删除图片后资源仍可恢复。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/services/writer/WriterService.ts src/renderer/src/components/writer
git commit -m "feat: 添加写作图片节点与资源导入"
```

---

### Task 10: 添加基础表格、脚注与大纲

**Files:**
- Create: `src/renderer/src/components/writer/extensions/writerFootnotes.ts`
- Create: `src/renderer/src/components/writer/extensions/writerFootnotes.test.ts`
- Create: `src/renderer/src/components/writer/extensions/writerTable.ts`
- Create: `src/renderer/src/components/writer/extensions/writerTable.test.ts`
- Create: `src/renderer/src/components/writer/outline/writerOutline.ts`
- Create: `src/renderer/src/components/writer/outline/writerOutline.test.ts`
- Create: `src/renderer/src/components/writer/outline/WriterOutline.tsx`
- Create: `src/renderer/src/components/writer/outline/WriterOutline.module.css`
- Create: `src/renderer/src/components/writer/nodes/WriterTableControls.tsx`
- Create: `src/renderer/src/components/writer/nodes/WriterTableControls.module.css`
- Modify: `src/renderer/src/components/writer/extensions/createWriterExtensions.ts`
- Modify: `src/renderer/src/components/chrome/WriterSidebarSection.tsx`
- Modify: `src/renderer/src/components/writer/toolbar/WriterSlashMenu.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `footnoteReference` 与 `footnoteDefinition`，通过稳定 `footnoteId` 关联。
- Produces: `deriveFootnoteNumbers(document): Map<string, number>`。
- Produces: `deriveWriterOutline(document): WriterOutlineItem[]`。

- [ ] **Step 1: 写脚注编号和大纲失败测试**

```ts
test('脚注编号按引用首次出现顺序派生', () => {
  const numbers = deriveFootnoteNumbers(createFootnoteDocument(['note-b', 'note-a', 'note-b']))
  assert.equal(numbers.get('note-b'), 1)
  assert.equal(numbers.get('note-a'), 2)
})

test('大纲只包含标题并保留层级与 nodeId', () => {
  const outline = deriveWriterOutline(createHeadingDocument())
  assert.deepEqual(outline, [
    { nodeId: 'h-1', level: 1, text: '第一章' },
    { nodeId: 'h-2', level: 2, text: '背景' }
  ])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/writer/extensions/writerTable.test.ts src/renderer/src/components/writer/extensions/writerFootnotes.test.ts src/renderer/src/components/writer/outline/writerOutline.test.ts`

Expected: FAIL，表格、脚注和大纲模块不存在。

- [ ] **Step 3: 实现表格、脚注和大纲**

表格使用官方 Table/Row/Header/Cell 扩展，禁止合并单元格与嵌套表格；Node 工具只提供新增/删除
行列、切换表头、left/center/right 对齐。窄窗口的表格容器使用 `overflow-x: auto`。
`writerTable.test.ts` 验证合并单元格命令未注册、嵌套 table JSON 被 Schema 拒绝、删除最后一列
会删除整表而不留下非法空表。

脚注引用点击滚动到对应定义，定义点击返回最近引用；删除最后一个引用时保留定义，避免静默
丢内容，并在定义旁显示“未引用”。编号始终派生，不写回 JSON。

大纲从当前 EditorState 订阅 heading transaction 派生，不保存第二份目录。点击条目通过
`nodeId` 定位并滚动；侧栏“文档/大纲”切换保持同一侧栏，不增加新的导航层。

- [ ] **Step 4: 运行测试与交互验证**

Run: `yarn test:writer`

Expected: 表格边界、脚注编号、大纲派生测试 PASS。

Run: `yarn typecheck:web`

Expected: 无错误。

Run: `yarn dev`

Expected: 表格操作不出现合并单元格；脚注双向跳转；大纲随标题修改实时更新并可定位正文。

- [ ] **Step 5: 提交**

```bash
git add package.json src/renderer/src/components/chrome/WriterSidebarSection.tsx src/renderer/src/components/writer
git commit -m "feat: 添加写作表格脚注与大纲"
```

---

### Task 11: 抽取通用 AI 面板外壳并建立独立写作会话

**Files:**
- Create: `src/main/services/session/factories/WriterSessionFactory.ts`
- Create: `src/main/services/session/factories/WriterSessionFactory.test.ts`
- Create: `src/renderer/src/components/assistant/AssistantPanelShell.tsx`
- Create: `src/renderer/src/components/assistant/AssistantPanelShell.module.css`
- Create: `src/renderer/src/components/writer/chat/WriterChatPanel.tsx`
- Create: `src/renderer/src/components/writer/chat/WriterChatPanel.module.css`
- Create: `src/renderer/src/components/writer/chat/WriterSourceSelector.tsx`
- Create: `src/renderer/src/components/writer/chat/WriterSourceSelector.module.css`
- Create: `src/renderer/src/components/writer/chat/useWriterChatSession.ts`
- Create: `src/renderer/src/components/writer/chat/useWriterChatStream.ts`
- Create: `src/renderer/src/stores/writer/writerChatStore.ts`
- Create: `src/renderer/src/stores/writer/writerChatStore.test.ts`
- Modify: `src/shared/types/session.ts`
- Modify: `src/main/services/session/factories/SessionFactory.ts`
- Modify: `src/main/services/session/factories/SessionFactoryRegistry.ts`
- Modify: `src/main/services/session/factories/index.ts`
- Modify: `src/main/services/session/SessionService.ts`
- Modify: `src/main/ipc/handlers/sessionHandlers.ts`
- Modify: `src/preload/apis/session.ts`
- Modify: `src/preload/types/session.ts`
- Modify: `src/renderer/src/components/paper/chat/PaperChatPanel.tsx`
- Modify: `src/renderer/src/components/paper/chat/PaperChatPanel.module.css`
- Modify: `src/renderer/src/components/paper/chat/PaperChatInput.tsx`
- Modify: `src/renderer/src/pages/WritingPage.tsx`
- Modify: `src/renderer/src/pages/WritingPage.module.css`
- Modify: `src/renderer/src/stores/uiStateStore.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `SessionType` 新增 `'writer'`。
- Produces: `SessionResourceRef = { kind: 'writer'; id: string }` 和
  `SessionData.resourceRef?: SessionResourceRef`。
- Produces: `AssistantPanelShell`，只负责 header、status、message viewport、composer slot。
- Produces: 每篇文档独立的 writer session、消息、附件、知识库选择和流事件。
- Produces: 可选 `selectedPaperId`；默认未选择，不自动读取当前或最近论文。

- [ ] **Step 1: 写 writer session 和聊天隔离失败测试**

`WriterSessionFactory.test.ts`：

```ts
test('WriterSessionFactory 创建带文档资源引用的独立会话', () => {
  const factory = new WriterSessionFactory()
  const session = factory.create('写作对话', {
    kind: 'writer',
    id: 'writer-12345678'
  })
  assert.equal(session.sessionType, 'writer')
  assert.deepEqual(session.resourceRef, {
    kind: 'writer',
    id: 'writer-12345678'
  })
})
```

`writerChatStore.test.ts`：

```ts
test('不同写作文档的消息和流状态互不共享', () => {
  const store = useWriterChatStore.getState()
  store.initializeSession('session-a', 'writer-a')
  store.initializeSession('session-b', 'writer-b')
  store.appendContent('session-a', '回答 A')
  assert.equal(store.getSession('session-a')?.streamingContent, '回答 A')
  assert.equal(store.getSession('session-b')?.streamingContent, '')
  assert.equal(store.getSession('session-a')?.selectedPaperId, undefined)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/session/factories/WriterSessionFactory.test.ts src/renderer/src/stores/writer/writerChatStore.test.ts`

Expected: FAIL，Writer factory 与聊天 Store 不存在。

- [ ] **Step 3: 实现会话关联与通用外壳**

把 `SessionFactory.create` 签名扩为：

```ts
create(title?: string, resourceRef?: SessionResourceRef): SessionData
```

现有四个 factory 忽略可选 `resourceRef`；Writer factory 要求
`resourceRef?.kind === 'writer'`。`sessionApi.create` 新增第三个可选参数并保持现有调用兼容：

```ts
create(
  title?: string,
  type?: SessionType,
  resourceRef?: SessionResourceRef
): Promise<SessionResult>
```

`SessionSelectionState` 增加 `selectedPaperId?: string`，只供 writer 会话保存用户主动选择的论文；
现有 paper/default/knowledge/tool 会话保持兼容。

`SessionListItem` 包含可选 `resourceRef`，`useWriterChatSession` 先从列表查找
`sessionType === 'writer' && resourceRef.id === documentId`，找不到才创建。

`AssistantPanelShellProps` 固定为：

```ts
interface AssistantPanelShellProps {
  title: string
  subtitle?: string
  status?: string
  loading?: boolean
  onClear: () => void
  onClose: () => void
  messages: React.ReactNode
  composer: React.ReactNode
}
```

`PaperChatPanel` 改用该外壳但保留论文 hook、Store 与文案；`WriterChatPanel` 使用独立 writer
hook/Store。`PaperChatInput` 新增 `allowPaperQuotes` 和 `allowPaperWebSearch`，默认 true；
Writer 传 false，仍复用模型、附件、MCP、知识库选择控件。

`WriterSourceSelector` 通过既有 `window.api.paper.list()` 展示可搜索论文列表，每次最多主动选择
一篇论文，另可在复用的输入控件中选择多个知识库。选择状态保存到 writer session 的
`selectionState.selectedPaperId`；新会话默认 undefined，不读取 `lastPaperId`，也不自动把写作文档
加入知识库。

`WritingPage` 增加 340–680px 可拖动 AI slot，默认关闭；面板关闭时编辑表面延伸到右缘。

- [ ] **Step 4: 运行 writer、paper chat 与类型检查**

Run: `yarn test:writer`

Expected: writer session 和聊天隔离测试 PASS。

Run: `yarn test:paper-chat`

Expected: 论文聊天无回归。

Run: `yarn typecheck`

Expected: SessionType、Factory 和 preload 签名一致。

- [ ] **Step 5: 提交**

```bash
git add package.json src/shared/types/session.ts src/main/services/session src/main/ipc/handlers/sessionHandlers.ts src/preload/apis/session.ts src/preload/types/session.ts src/renderer/src/components/assistant src/renderer/src/components/paper/chat src/renderer/src/components/writer/chat src/renderer/src/pages/WritingPage.tsx src/renderer/src/pages/WritingPage.module.css src/renderer/src/stores
git commit -m "feat: 复用 AI 面板并隔离写作会话"
```

---

### Task 12: 接入 Writer Capability 并只允许结构化编辑建议

**Files:**
- Create: `src/shared/utils/writerText.ts`
- Create: `src/shared/utils/writerText.test.ts`
- Create: `src/main/services/writer/WriterContextFormatter.ts`
- Create: `src/main/services/writer/WriterContextFormatter.test.ts`
- Create: `src/main/services/chat/tools/adapters/WriterToolAdapter.ts`
- Create: `src/main/services/chat/tools/adapters/WriterToolAdapter.test.ts`
- Create: `src/main/services/chat/tools/capabilities/WriterCapability.ts`
- Create: `src/main/services/chat/tools/capabilities/WriterCapability.test.ts`
- Modify: `src/shared/types/writer.ts`
- Modify: `src/shared/schemas/writerSchema.ts`
- Modify: `src/shared/types/chat.ts`
- Modify: `src/shared/types/tool-stats.ts`
- Modify: `src/main/services/chat/ChatService.ts`
- Modify: `src/main/services/chat/ReactLoopService.ts`
- Modify: `src/main/services/chat/tools/UnifiedToolRegistry.ts`
- Modify: `src/main/services/chat/tools/capabilities/registerBuiltinCapabilities.ts`
- Modify: `src/main/services/chat/tools/presets/builtinPresets.ts`
- Modify: `src/main/services/chat/tools/presets/PresetRegistry.test.ts`
- Modify: `src/main/services/chat/tools/CapabilityManager.test.ts`
- Modify: `src/main/services/chat/tools/ToolResultEnricher.ts`
- Modify: `src/main/services/chat/tools/ToolResultMerger.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WriterAiScope`, `WriterAiAnchor`, `WriterAiContextBlock`,
  `WriterAiRequestContext`, `WriterEditOperationInput`, `WriterEditOperation`,
  `WriterAiProposal`。
- Produces: `writer__propose_edits`，只能返回建议，不能保存文档或修改标题。
- Produces: `CHAT_WRITER_PRESET`，默认激活 writer capability，knowledge 按用户选择启用。

- [ ] **Step 1: 写哈希、上下文和适配器失败测试**

在 `WriterToolAdapter.test.ts`：

```ts
test('适配器接受范围内替换并生成带原文哈希的建议', async () => {
  const context = createWriterContext({
    scope: 'selection',
    blocks: [{ nodeId: 'p-1', type: 'paragraph', text: '原始句子' }]
  })
  const adapter = new WriterToolAdapter(context)
  const result = await adapter.execute('writer__propose_edits', {
    operations: [
      {
        kind: 'replace_text',
        blockId: 'p-1',
        from: 0,
        to: 4,
        text: '修改后'
      }
    ]
  })
  assert.equal(result.success, true)
  assert.equal((result.content as WriterAiProposal).operations.length, 1)
})

test('适配器拒绝标题修改、越界节点和图片结构变化', async () => {
  const adapter = new WriterToolAdapter(createWriterContext())
  const result = await adapter.execute('writer__propose_edits', {
    operations: [{ kind: 'delete_blocks', blockIds: ['image-1'] }]
  })
  assert.equal(result.success, false)
})
```

`WriterContextFormatter.test.ts` 验证 cursor/selection/section 只包含目标块，document 按标题分组；
`writerText.test.ts` 验证相同 Unicode 文本得到稳定 SHA-256，换行规范化后哈希一致。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/shared/utils/writerText.test.ts src/main/services/writer/WriterContextFormatter.test.ts src/main/services/chat/tools/adapters/WriterToolAdapter.test.ts src/main/services/chat/tools/capabilities/WriterCapability.test.ts`

Expected: FAIL，writer AI 模块不存在。

- [ ] **Step 3: 定义受限操作并接入 CapabilityComposer**

在 `writer.ts` 定义：

```ts
export type WriterAiScope = 'cursor' | 'selection' | 'section' | 'document'

export interface WriterAiAnchor {
  documentId: string
  baseRevision: number
  scope: WriterAiScope
  startBlockId: string
  endBlockId: string
  startOffset: number
  endOffset: number
  expectedTextHash: string
}

export interface WriterAiContextBlock {
  nodeId: string
  type: 'paragraph' | 'heading' | 'listItem' | 'blockquote' | 'codeBlock' | 'blockMath'
  text: string
  level?: number
}

export interface WriterAiRequestContext {
  documentId: string
  baseRevision: number
  title: string
  anchor: WriterAiAnchor
  blocks: WriterAiContextBlock[]
}

export type WriterEditOperationInput =
  | {
      kind: 'insert_text'
      blockId: string
      offset: number
      text: string
    }
  | {
      kind: 'replace_text'
      blockId: string
      from: number
      to: number
      text: string
    }
  | {
      kind: 'delete_text'
      blockId: string
      from: number
      to: number
    }
  | {
      kind: 'insert_blocks' | 'replace_blocks'
      afterBlockId?: string
      targetBlockIds?: string[]
      blocks: WriterAiContextBlock[]
    }

export type WriterEditOperation =
  | {
      kind: 'insert_text'
      blockId: string
      offset: number
      text: string
    }
  | {
      kind: 'replace_text'
      blockId: string
      from: number
      to: number
      text: string
      expectedTextHash: string
    }
  | {
      kind: 'delete_text'
      blockId: string
      from: number
      to: number
      expectedTextHash: string
    }
  | {
      kind: 'insert_blocks'
      afterBlockId?: string
      blocks: WriterAiContextBlock[]
    }
  | {
      kind: 'replace_blocks'
      targetBlockIds: string[]
      blocks: WriterAiContextBlock[]
      expectedBlockHashes: Record<string, string>
    }

export interface WriterAiProposal {
  proposalId: string
  documentId: string
  baseRevision: number
  anchor: WriterAiAnchor
  operations: WriterEditOperation[]
  createdAt: string
}
```

模型工具参数使用 `WriterEditOperationInput`，不信任模型生成哈希。适配器根据请求快照为
replace/delete 操作计算目标切片的 `expectedTextHash`，为 replace_blocks 计算
`expectedBlockHashes`，形成最终 `WriterEditOperation`；Renderer 再次对当前目标计算哈希。
insert 操作不带哈希字段。

Zod 限制：每次最多 100 个操作、插入文本总计最多 100,000 字符、块只允许上述六类、所有
blockId 必须来自请求范围、操作不能重叠。表格单元格、图片 alt/caption 由 Renderer 转成
paragraph-like context block；适配器不能创建/删除/移动 image，也不能改变 table 结构。

`WriterCapability.id = 'writer'`，`CHAT_WRITER_PRESET`：

```ts
export const CHAT_WRITER_PRESET: ConsumerPreset = {
  id: 'chat.writer',
  defaultCapabilities: ['writer'],
  defaultComposition: {
    stages: [
      { capabilityId: 'writer', mode: 'on_demand' },
      { capabilityId: 'paper', mode: 'on_demand' },
      { capabilityId: 'knowledge', mode: 'on_demand' }
    ],
    mergeStrategy: 'none'
  }
}
```

`ChatService.hasTools` 把有效 `request.writerContext` 计入；`ReactLoopService` 的 composer context
加入 writerContext，并在通用 system prompt 后插入 `WriterContextFormatter` 生成的只读上下文
消息。Formatter 清晰声明标题只读、范围不可扩大、必须调用 `writer__propose_edits` 才能产生
修改。长 document 范围按 heading 分组并在请求构造阶段执行 token 上限检查。

WriterChat 发请求时只有在 `selectedPaperId` 存在时才设置 `request.paperId`。ReAct runtime
只对 `sessionType === 'writer' && request.paperId` 动态调用
`capabilityManager.addCapability(sessionId, 'paper')`；未选择论文时不注册论文检索工具。
知识库仍沿用 `selectedKnowledgeBases`，同样只在用户选择后激活。ReactLoop 构造函数把
`CHAT_WRITER_PRESET` 与现有 paper/default preset 一起注册。

`UnifiedToolRegistry` 为 writer category 输出 `writer__` 前缀。工具结果仍走现有
`tool_result.result`，Renderer 只对 `name === 'writer__propose_edits'` 的内容再次使用共享 Zod
Schema 校验。

`ToolResultEnricher` 为 writer suggestion 返回 `sourceType: 'writer'`；`ToolResultMerger` 对 writer
结果使用 `none`，不得排序、拼接或去重编辑操作。

- [ ] **Step 4: 运行 writer 与工具系统回归**

Run: `yarn test:writer`

Expected: 哈希、上下文、适配器与 capability 测试 PASS。

Run: `yarn test:capabilities`

Expected: 现有能力测试及 WriterCapability PASS。

Run: `yarn test:presets`

Expected: writer preset 已注册，session type 映射到 `chat.writer`。

Run: `yarn test:capability-manager`

Expected: writer session 默认启用 writer capability，其他会话默认能力不变。

Run: `yarn test:tool-orchestration`

Expected: writer category 不破坏合并与富化。

Run: `yarn test:prompt`

Expected: ChatService 在 writerContext 存在时进入 ReAct，无 writerContext 时保持既有路由。

- [ ] **Step 5: 提交**

```bash
git add package.json src/shared src/main/services/writer src/main/services/chat
git commit -m "feat: 添加受限写作 AI 编辑能力"
```

---

### Task 13: 实现 AI 原位差异、冲突失效与单事务接受

**Files:**
- Create: `src/renderer/src/components/writer/suggestions/writerSuggestionCore.ts`
- Create: `src/renderer/src/components/writer/suggestions/writerSuggestionCore.test.ts`
- Create: `src/renderer/src/components/writer/suggestions/writerSuggestionPlugin.ts`
- Create: `src/renderer/src/components/writer/suggestions/WriterSuggestionActions.tsx`
- Create: `src/renderer/src/components/writer/suggestions/WriterSuggestionActions.module.css`
- Create: `src/renderer/src/stores/writer/writerSuggestionStore.ts`
- Create: `src/renderer/src/stores/writer/writerSuggestionStore.test.ts`
- Modify: `src/renderer/src/components/writer/chat/useWriterChatStream.ts`
- Modify: `src/renderer/src/components/writer/WriterEditor.tsx`
- Modify: `src/renderer/src/themes/lumina-dark.css`
- Modify: `src/renderer/src/themes/lumina-light.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `createWriterAiRequestContext(editor, scope, revision)`。
- Produces: `validateProposalAgainstState(proposal, state): ProposalValidationResult`。
- Produces: `applyAcceptedOperations(state, operations): Transaction`。
- Produces: ProseMirror plugin key `writerSuggestionPluginKey`。

- [ ] **Step 1: 写映射、失效和撤销失败测试**

```ts
test('目标外 Transaction 映射锚点但不使建议失效', () => {
  const initial = createSuggestionState('目标文本', '目标外内容')
  const proposal = createReplaceProposal('target-block', 0, 4, '修改文本')
  const next = applyTextChangeOutsideTarget(initial, 'outside-block', 0, '新增')
  const validation = validateProposalAgainstState(proposal, next)
  assert.equal(validation.valid, true)
})

test('目标文本变化使建议失效且不能接受', () => {
  const initial = createSuggestionState('目标文本', '目标外内容')
  const proposal = createReplaceProposal('target-block', 0, 4, '修改文本')
  const changed = applyTextChangeInsideTarget(initial, 'target-block', 0, '新')
  const validation = validateProposalAgainstState(proposal, changed)
  assert.equal(validation.valid, false)
  assert.equal(validation.reason, 'target_changed')
})

test('全部接受只产生一个历史步骤并可一次撤销', () => {
  const { nextState, undoDepthBefore, undoDepthAfter } = acceptProposalFixture()
  assert.equal(undoDepthAfter, undoDepthBefore + 1)
  assert.match(nextState.doc.textContent, /修改文本/)
})
```

Store 测试覆盖逐项接受/拒绝、全部接受/拒绝、切换文档取消请求、无效 proposal 不进入 active。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/writer/suggestions/writerSuggestionCore.test.ts src/renderer/src/stores/writer/writerSuggestionStore.test.ts`

Expected: FAIL，建议模块不存在。

- [ ] **Step 3: 实现双重校验、Decoration 与接受事务**

请求发出时保存 `baseRevision`、`EditorState` 锚点和目标哈希；等待期间 plugin 用每个
`tr.mapping` 映射位置。`baseRevision` 只校验会话谱系：文档切换、重载或主进程修订冲突失效；
同一编辑器内目标外 transaction 不因 revision 增加而失效。

Renderer 收到 `writer__propose_edits` tool result 后执行：

1. Zod 解析。
2. documentId 与当前会话匹配。
3. 节点 ID、offset、范围、重叠、允许节点类型检查。
4. 对当前目标文本重算 SHA-256。
5. 用当前 Tiptap Schema 构造临时 slice 并校验。
6. 任一操作失败则整组拒绝，不显示部分结果。

Decoration：

- 新增文本使用 `--sm-color-writer-diff-add-bg/text`。
- 删除文本使用 `--sm-color-writer-diff-delete-bg/text` 和删除线。
- 替换同时显示旧内容删除与新内容 widget。
- 块级新增以 widget decoration 放在目标位置。

在两个主题文件定义对应 token，不在 CSS Module 硬编码色值。`WriterSuggestionActions`
提供逐项接受/拒绝和全部接受/拒绝；全部接受构造一个 `tr`，设置
`tr.setMeta('writerSuggestionAccept', proposalId)` 后一次 dispatch，因此是单个 undo 步骤。
未接受建议永不进入 `editor.getJSON()`，自动保存看不到 decoration。

- [ ] **Step 4: 运行 AI 建议测试和人工冲突验证**

Run: `yarn test:writer`

Expected: 建议映射、失效、接受/拒绝、单事务撤销全部 PASS。

Run: `yarn test:paper-chat`

Expected: 通用 AI 外壳与输入没有论文聊天回归。

Run: `yarn typecheck:web`

Expected: 无错误。

Run: `yarn dev`

Expected: AI 改动在正文原位置高亮；未接受时重新打开文档不含建议；编辑目标外内容建议仍在；
编辑目标内容后建议立即标记失效；全部接受后一次撤销可恢复。

- [ ] **Step 5: 提交**

```bash
git add package.json src/renderer/src/components/writer src/renderer/src/stores/writer src/renderer/src/themes
git commit -m "feat: 添加 AI 原位差异与确认应用"
```

---

### Task 14: 建立统一导出 AST 并实现 Markdown 导出

**Files:**
- Create: `src/main/services/writer/WriterDocumentMapper.ts`
- Create: `src/main/services/writer/WriterDocumentMapper.test.ts`
- Create: `src/main/services/writer/WriterMarkdownExporter.ts`
- Create: `src/main/services/writer/WriterMarkdownExporter.test.ts`
- Modify: `src/main/services/writer/WriterService.ts`
- Modify: `src/main/services/writer/index.ts`
- Modify: `src/main/ipc/handlers/writerHandlers.ts`
- Modify: `src/preload/apis/writer.ts`
- Modify: `src/preload/types/writer.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WriterExportDocument` 与判别联合 `WriterExportNode`。
- Produces: `WriterDocumentMapper.map(document): WriterResult<WriterExportDocument>`。
- Produces: `WriterMarkdownExporter.export(document, outputPath): Promise<WriterResult<void>>`。
- Produces: `window.api.writer.exportDocument(documentId, format)`；Task 14 的 UI 只显示 Markdown，
  DOCX/PDF 在对应输出器完成后再加入菜单。

- [ ] **Step 1: 写映射和 Markdown 失败测试**

```ts
test('统一 AST 保留标题、公式、图片、表格、任务和脚注', () => {
  const mapped = new WriterDocumentMapper().map(createRichWriterDocument())
  assert.equal(mapped.success, true)
  assert.equal(mapped.data?.title, '通用文档')
  assert.deepEqual(
    mapped.data?.nodes.map((node) => node.kind),
    ['heading', 'paragraph', 'math', 'image', 'table', 'taskList', 'footnotes']
  )
})

test('Markdown 使用相对图片、GFM 表格任务和脚注', async () => {
  const result = await exporter.render(createRichExportDocument())
  assert.match(result.markdown, /!\[示意图\]\(通用文档\.assets\/hash\.png\)/)
  assert.match(result.markdown, /\| 名称 \| 数值 \|/)
  assert.match(result.markdown, /- \[x\] 已完成/)
  assert.match(result.markdown, /\[\^1\]/)
  assert.match(result.markdown, /\$\$[\s\S]*E = mc\^2[\s\S]*\$\$/)
})
```

另测链接与 Markdown 特殊字符转义、代码围栏中包含反引号时自动增加围栏长度、无法表达节点
输出可读文本警告而非丢弃。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterDocumentMapper.test.ts src/main/services/writer/WriterMarkdownExporter.test.ts`

Expected: FAIL，Mapper 与 Exporter 不存在。

- [ ] **Step 3: 实现稳定 AST 和原子 Markdown 输出**

核心 AST：

```ts
export interface WriterExportDocument {
  title: string
  nodes: WriterExportNode[]
  assets: Array<{ sourcePath: string; exportName: string }>
  warnings: string[]
}

export type WriterExportNode =
  | { kind: 'paragraph'; runs: WriterExportRun[] }
  | { kind: 'heading'; level: number; runs: WriterExportRun[] }
  | { kind: 'blockquote'; children: WriterExportNode[] }
  | { kind: 'bulletList' | 'orderedList' | 'taskList'; items: WriterExportListItem[] }
  | { kind: 'code'; language?: string; text: string }
  | { kind: 'math'; display: boolean; latex: string }
  | { kind: 'image'; assetPath: string; alt: string; caption?: string; width: number }
  | { kind: 'table'; rows: WriterExportTableRow[] }
  | { kind: 'horizontalRule' }
  | { kind: 'footnotes'; items: WriterExportFootnote[] }
```

Mapper 是唯一解释 Tiptap node/mark 的层；DOCX/PDF/Markdown 输出器不得读取 Tiptap JSON。
标题作为输出顶级 H1，正文已有 H1 保持 H1，不自动降级。

Markdown 输出先写同目录临时 `.md` 与临时 assets 目录；全部图片复制成功后再 rename 为最终
文件和 `<basename>.assets/`。最终同名 assets 已存在时先要求用户在导出确认中选择覆盖；
失败清理临时产物，不改原文。

覆盖流程固定为：`showSaveDialog` 选择 `.md` → 检测精确派生的 `<basename>.assets/` →
`dialog.showMessageBox({ type: 'warning', buttons: ['取消', '覆盖'], cancelId: 0, defaultId: 0 })`。
只有用户选择“覆盖”后才删除该精确 assets 目录并原子替换；不使用 glob。取消返回
`{ success: true, data: { canceled: true } }`。

- [ ] **Step 4: 运行导出测试**

Run: `yarn test:writer`

Expected: Mapper 和 Markdown exporter 测试 PASS。

Run: `yarn typecheck:node`

Expected: 输出器只消费 `WriterExportDocument`。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/services/writer src/main/ipc/handlers/writerHandlers.ts src/preload/apis/writer.ts src/preload/types/writer.ts
git commit -m "feat: 添加统一导出模型与 Markdown 输出"
```

---

### Task 15: 实现 DOCX 导出与公式图片降级

**Files:**
- Create: `src/main/services/writer/WriterFormulaRasterizer.ts`
- Create: `src/main/services/writer/WriterFormulaRasterizer.test.ts`
- Create: `src/main/services/writer/WriterDocxExporter.ts`
- Create: `src/main/services/writer/WriterDocxExporter.test.ts`
- Modify: `src/main/services/writer/WriterService.ts`
- Modify: `src/main/services/writer/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WriterFormulaRasterizer.rasterize(latex, displayMode): Promise<WriterResult<Buffer>>`。
- Produces: `WriterDocxExporter.build(document): Promise<WriterDocxBuildResult>`，供映射测试读取
  `formulas`, `plainText`, `warnings`。
- Produces: `WriterDocxExporter.export(document, outputPath): Promise<WriterResult<void>>`。
- Consumes: Task 14 的 `WriterExportDocument`，不读取 Tiptap JSON。

- [ ] **Step 1: 写 DOCX 映射与公式降级失败测试**

```ts
test('DOCX 是 ZIP 并包含正文与图片媒体', async () => {
  const rasterizer = new FakeFormulaRasterizer(validPngBytes)
  const buffer = await new WriterDocxExporter(rasterizer).render(
    createRichExportDocument()
  )
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK')
  assert.equal(buffer.includes(Buffer.from('word/document.xml')), true)
  assert.equal(buffer.includes(Buffer.from('word/media/')), true)
})

test('公式图片模型携带 LaTeX 替代文本', async () => {
  const rasterizer = new FakeFormulaRasterizer(validPngBytes)
  const result = await new WriterDocxExporter(rasterizer).build(
    createMathExportDocument('E = mc^2')
  )
  assert.equal(result.formulas[0].altText.description, 'E = mc^2')
})

test('公式栅格化失败时写入可读 LaTeX 并产生警告', async () => {
  const rasterizer = new FakeFormulaRasterizer(null)
  const result = await new WriterDocxExporter(rasterizer).build(
    createMathExportDocument('\\frac{')
  )
  assert.match(result.plainText, /\\frac\{/)
  assert.equal(result.warnings.length, 1)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterFormulaRasterizer.test.ts src/main/services/writer/WriterDocxExporter.test.ts`

Expected: FAIL，DOCX 模块不存在。

- [ ] **Step 3: 实现固定通用样式与离屏公式渲染**

DOCX 使用 `docx` 的 Document、Paragraph、TextRun、HeadingLevel、Table、ImageRun、
FootnoteReferenceRun 和 Packer。固定样式：

- 页面浅色，默认字体为系统通用无衬线中文栈，不读取应用主题。
- 标题、正文、引用、代码、表格使用固定样式 ID。
- 图片保持宽高比并限制在内容宽度。
- 任务列表使用 Unicode 勾选框文本降级，避免 Word 兼容差异。

`WriterFormulaRasterizer`：

1. 主进程用 `katex.renderToString` 生成 `htmlAndMathml`。
2. 读取本地 `katex.min.css`，构造 CSP 为
   `default-src 'none'; style-src 'unsafe-inline'; img-src data:` 的独立 HTML。
3. 使用 `show: false`、`sandbox: true`、`nodeIntegration: false` 的隐藏 BrowserWindow。
4. 按公式元素 bounding rect，以 3 倍尺寸 `capturePage` 并输出 PNG。
5. 在 `finally` 销毁窗口；失败返回错误，由 DOCX exporter 写 LaTeX 文本和 warning。

DOCX 先写 `<output>.tmp`，Packer 完成并 fsync 后 rename。公式图片设置
`altText: { title: 'LaTeX formula', description: latex, name: 'formula' }`，不承诺 Word 原生可编辑。

- [ ] **Step 4: 运行 DOCX 测试与打开验证**

Run: `yarn test:writer`

Expected: DOCX ZIP、正文映射、图片和公式降级测试 PASS。

Run: `yarn typecheck:node`

Expected: 无错误。

Run: `yarn dev`

Expected: 导出的 DOCX 可被 Word/LibreOffice 打开；标题、列表、表格、图片、脚注可读；公式是清晰图片，失败公式显示 LaTeX 文本。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/services/writer
git commit -m "feat: 添加 DOCX 与公式图片导出"
```

---

### Task 16: 实现安全打印 HTML 与 PDF 导出

**Files:**
- Create: `src/main/services/writer/WriterPrintHtmlRenderer.ts`
- Create: `src/main/services/writer/WriterPrintHtmlRenderer.test.ts`
- Create: `src/main/services/writer/WriterPrintExporter.ts`
- Create: `src/main/services/writer/WriterPrintExporter.test.ts`
- Modify: `src/main/services/writer/WriterService.ts`
- Modify: `src/main/ipc/handlers/writerHandlers.ts`
- Modify: `src/main/services/writer/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WriterPrintHtmlRenderer.render(document): WriterResult<string>`。
- Produces: `WriterPrintExporter.export(document, outputPath): Promise<WriterResult<void>>`。
- Consumes: Task 14 的 `WriterExportDocument`。

- [ ] **Step 1: 写打印安全和失败清理测试**

```ts
test('打印 HTML 固定浅色且不包含网络来源', () => {
  const html = new WriterPrintHtmlRenderer().render(createRichExportDocument()).data!
  assert.match(html, /default-src 'none'/)
  assert.match(html, /background:\s*#fff/)
  assert.doesNotMatch(html, /https?:|<script|<iframe/i)
  assert.match(html, /class="katex"/)
})

test('printToPDF 失败会删除临时文件且不覆盖目标', async () => {
  const exporter = createPrintExporter({
    printToPDF: async () => {
      throw new Error('打印失败')
    }
  })
  const result = await exporter.export(createRichExportDocument(), outputPath)
  assert.equal(result.success, false)
  assert.equal(existsSync(`${outputPath}.tmp`), false)
  assert.equal(readFileSync(outputPath, 'utf8'), '原目标')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterPrintHtmlRenderer.test.ts src/main/services/writer/WriterPrintExporter.test.ts`

Expected: FAIL，打印模块不存在。

- [ ] **Step 3: 实现离线打印和保存对话框**

HTML renderer 把 KaTeX CSS、代码高亮 CSS、图片 data URL 和固定打印 CSS 全部内联；执行以下
CSP：

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"
/>
```

隐藏 BrowserWindow 配置 `show: false`, `sandbox: true`, `nodeIntegration: false`,
`contextIsolation: true`；先把完整离线 HTML 写入系统临时目录的精确文件，再 `loadFile`，避免
超大文档触及 data URL 长度；加载完成后调用：

```ts
await webContents.printToPDF({
  printBackground: true,
  preferCSSPageSize: true,
  margins: { marginType: 'default' }
})
```

导出前 `writerHandlers` 根据格式调用 `dialog.showSaveDialog`：

- Markdown 默认扩展名 `.md`。
- DOCX 默认扩展名 `.docx`。
- PDF 默认扩展名 `.pdf`。
- 默认文件名来自经过文件名清理的标题。

PDF buffer 写临时文件、fsync、rename；`finally` 销毁隐藏窗口并清理临时 HTML/PDF。取消对话框
不视为错误。

- [ ] **Step 4: 运行 PDF 测试与三格式人工验证**

Run: `yarn test:writer`

Expected: 打印 HTML、PDF 文件头、失败清理测试 PASS。

Run: `yarn typecheck:node`

Expected: 无错误。

Run: `yarn dev`

Expected: Markdown、DOCX、PDF 的保存对话框、默认文件名和扩展名正确；PDF 可打开、固定浅色、
不访问网络，公式和代码高亮可见。

- [ ] **Step 5: 提交**

```bash
git add package.json src/main/ipc/handlers/writerHandlers.ts src/main/services/writer
git commit -m "feat: 添加安全 PDF 导出"
```

---

### Task 17: 完成性能、可访问性、安全与全链路验收

**Files:**
- Create: `src/main/services/writer/WriterService.integration.test.ts`
- Create: `src/renderer/src/components/writer/writerAccessibility.test.tsx`
- Create: `src/renderer/src/components/writer/writerPerformance.test.ts`
- Modify: `src/renderer/src/components/writer/WriterEditor.tsx`
- Modify: `src/renderer/src/components/writer/WriterEditor.module.css`
- Modify: `src/renderer/src/components/chrome/WriterSidebarSection.tsx`
- Modify: `src/renderer/src/pages/WritingPage.tsx`
- Modify: `src/main/services/writer/WriterService.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: 最终 `yarn test:writer` 聚合命令。
- Produces: 写作服务从创建、保存、资源、导出到永久删除的集成保证。
- Produces: 可测的 `filterWriterDocuments` 与 `buildBoundedWriterAiContext`。

- [ ] **Step 1: 写集成、性能和可访问性失败测试**

`WriterService.integration.test.ts`：

```ts
test('创建、保存、导入资源、导出并永久删除形成完整闭环', async () => {
  const service = createWriterIntegrationService()
  await service.initialize()
  const document = (await service.createDocument('闭环文档')).data!
  const asset = await service.importAsset(document.id, {
    fileName: 'figure.png',
    declaredMimeType: 'image/png',
    bytes: pngFixture
  })
  const saved = await service.saveDocument(
    attachImage(document, asset.data!.relativePath)
  )
  const exported = await service.exportDocument(saved.data!.id, 'markdown', outputPath)
  assert.equal(exported.success, true)
  assert.equal(existsSync(outputPath), true)
  await service.deleteDocument(document.id)
  assert.equal(existsSync(getWriterDocumentDir(document.id)), false)
})
```

`writerPerformance.test.ts` 生成 1000 个摘要，断言搜索函数不改变输入、返回正确顺序，并用
`performance.now()` 记录耗时低于 50ms；AI context builder 对超长文档按 heading 分组并在字符
预算内截断，返回 `truncated: true`。

`writerAccessibility.test.tsx` 使用 `renderToStaticMarkup` 验证标题输入有 label、保存状态
`role="status" aria-live="polite"`、AI 建议按钮有明确 aria-label、Slash Menu 使用 listbox/option。

- [ ] **Step 2: 运行新增测试确认失败**

Run: `node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/services/writer/WriterService.integration.test.ts src/renderer/src/components/writer/writerAccessibility.test.tsx src/renderer/src/components/writer/writerPerformance.test.ts`

Expected: FAIL，集成 fixture 或可访问性/性能导出尚未完成。

- [ ] **Step 3: 完成边界实现并固定聚合测试脚本**

实现并验证：

- 普通文档打开后 800ms 内可输入；加载列表不读取全部正文。
- 1000 篇文档启用虚拟列表，搜索只对摘要运行。
- 正文不虚拟化；图片 `loading="lazy"`；所有 resize 使用 RAF。
- `prefers-reduced-motion` 下关闭写作浮层和 AI diff 的非必要动画。
- 状态变化通过 `aria-live` 播报；Escape 关闭菜单/公式浮层并恢复编辑器焦点。
- 文档关闭时在最后一次保存完成后运行资源垃圾回收。
- 应用退出的 5 秒 writer flush 超时路径记录 logger，绝不无限阻塞。
- 删除、资源、导出目标均使用已验证 ID/显式路径，不使用 glob、环境变量或未解析用户字符串。

把 `package.json` 脚本整理为三个显式子命令，并由顶层串联：

```json
"test:writer": "npm run test:writer:shared && npm run test:writer:main && npm run test:writer:renderer",
"test:writer:shared": "node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/shared/schemas/writerSchema.test.ts src/shared/utils/writerText.test.ts",
"test:writer:main": "node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/main/core/luminaProtocolResolver.test.ts src/main/ipc/handlers/writerValidation.test.ts src/main/services/session/factories/WriterSessionFactory.test.ts src/main/services/writer/WriterStorageService.test.ts src/main/services/writer/WriterAssetService.test.ts src/main/services/writer/WriterFlushCoordinator.test.ts src/main/services/writer/WriterContextFormatter.test.ts src/main/services/writer/WriterDocumentMapper.test.ts src/main/services/writer/WriterMarkdownExporter.test.ts src/main/services/writer/WriterFormulaRasterizer.test.ts src/main/services/writer/WriterDocxExporter.test.ts src/main/services/writer/WriterPrintHtmlRenderer.test.ts src/main/services/writer/WriterPrintExporter.test.ts src/main/services/writer/WriterService.integration.test.ts src/main/services/chat/tools/adapters/WriterToolAdapter.test.ts src/main/services/chat/tools/capabilities/WriterCapability.test.ts",
"test:writer:renderer": "node --loader ./scripts/test/tsAliasLoader.mjs --test --experimental-strip-types src/renderer/src/components/chrome/workspaceNavigation.test.ts src/renderer/src/stores/writer/writerLibraryStore.test.ts src/renderer/src/stores/writer/writerSessionStore.test.ts src/renderer/src/stores/writer/writerChatStore.test.ts src/renderer/src/stores/writer/writerSuggestionStore.test.ts src/renderer/src/components/writer/writerAutosave.test.ts src/renderer/src/components/writer/writerAccessibility.test.tsx src/renderer/src/components/writer/writerPerformance.test.ts src/renderer/src/components/writer/extensions/writerMarkdownRules.test.ts src/renderer/src/components/writer/extensions/writerClipboard.test.ts src/renderer/src/components/writer/extensions/writerMath.test.ts src/renderer/src/components/writer/extensions/writerImage.test.ts src/renderer/src/components/writer/extensions/writerTable.test.ts src/renderer/src/components/writer/extensions/writerFootnotes.test.ts src/renderer/src/components/writer/outline/writerOutline.test.ts src/renderer/src/components/writer/suggestions/writerSuggestionCore.test.ts"
```

- [ ] **Step 4: 运行完整自动验证**

Run: `yarn test:writer`

Expected: shared、main、renderer 三组全部 PASS，0 failures。

Run: `yarn test:paper-chat`

Expected: 全部 PASS。

Run: `yarn test:paper`

Expected: 全部 PASS。

Run: `yarn test:prompt`

Expected: 全部 PASS。

Run: `yarn test:tool-orchestration`

Expected: 全部 PASS。

Run: `yarn lint`

Expected: ESLint 与 knip 均无错误。

Run: `yarn build`

Expected: typecheck 与 electron-vite build 成功。

- [ ] **Step 5: 使用 in-app browser 做最终人工验收**

启动 `yarn dev`，在明暗主题各验证一次：

1. 从阅读或知识库一次点击创建空白文档。
2. 中间内容铺满可用空间，无黑边、纸张卡片和主题脱节。
3. Markdown 快捷输入、中文 IME、撤销/重做、粘贴清洗。
4. 公式、代码、图片、表格、脚注、大纲保存后重新打开一致。
5. AI cursor/selection/section/document 四个范围。
6. 建议原位高亮、逐项与全部接受/拒绝、目标冲突失效、一次撤销。
7. AI 面板关闭后编辑表面延伸到右缘；论文聊天仍可正常打开和流式回复。
8. Markdown、DOCX、PDF 用常用程序打开。
9. 删除文件夹不删文档；永久删除文档后正文和 assets 均消失且无恢复入口。
10. 界面中不存在笔记/论文类型选择、CSL、参考文献格式、历史版本和备份入口。

在 macOS 验证交通灯避让，在 Windows 验证自定义窗口按钮区域不覆盖标题、导出与 AI 按钮。

- [ ] **Step 6: 提交最终硬化**

```bash
git add package.json src/main/services/writer src/renderer/src/components/writer src/renderer/src/components/chrome/WriterSidebarSection.tsx src/renderer/src/pages/WritingPage.tsx
git commit -m "test: 完成写作工作区全链路验收"
```

---

## 完成定义

- 17 个任务按顺序完成，每个任务具有独立红绿测试证据与提交。
- `yarn test:writer`、论文聊天、论文、Prompt、工具编排、lint、build 全部通过。
- 写作视图满足无黑边、铺满中间区域、主题同步和 AI 面板关闭后右侧无残留画布。
- 自动保存只保留最后成功内容，不产生备份、回收站或历史版本。
- AI 建议在用户接受前不进入正文 JSON 与磁盘；失效建议无法强制应用。
- Markdown、DOCX、PDF 三种导出均经过实际打开验证。
- 永久删除经过危险确认后删除文档目录与资源，应用内不存在恢复入口。
