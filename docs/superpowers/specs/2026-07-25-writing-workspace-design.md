# Lumina 通用写作工作区设计

- 日期：2026-07-25
- 状态：已批准
- 目标范围：首期通用写作工作区
- 技术路线：Tiptap 3 + ProseMirror + 结构化 JSON

## 1. 背景

Lumina 已移除实验室子系统，当前一级工作区只包含论文阅读与知识库。应用需要新增第三个
一级工作区“写作”，为用户提供一个功能丰富、界面简单、无需预先选择用途的通用文档
编辑器。

写作工作区不是论文写作工具，不尝试替代 Word、Overleaf 或专业排版软件。用户可以用它
写笔记、文章、草稿、实验记录或其他任意内容。公式、表格、图片、代码和 AI 编辑只是通用
写作能力，不改变文档类型，也不引入论文格式概念。

## 2. 产品定义

### 2.1 核心目标

1. 用户点击一次即可创建空白文档并开始输入。
2. 所有内容使用同一种文档模型，不区分笔记、论文或其他用途。
3. 编辑体验采用纯语义即时渲染：Markdown 只作为输入快捷方式，转换后不常驻显示源码。
4. 默认界面只显示文档导航、标题、正文和保存状态；高级能力按需出现。
5. 支持丰富的通用内容块，包括公式、图片、表格、代码和脚注。
6. AI 可以在光标、选区、章节或全文范围生成编辑建议。
7. AI 修改必须先在正文原位置高亮，用户确认后才写入真实文档。
8. 文档本地自动保存，异常退出不会产生半写入文件。
9. 支持通用 Markdown、DOCX 和 PDF 导出。
10. 编辑区无纸张卡片或外层黑边，并完整跟随 Lumina 当前明暗主题。

### 2.2 明确非目标

- 不区分“笔记”和“论文”文档。
- 不提供论文、期刊、学校或学位论文模板。
- 不提供 CSL、APA、IEEE、GB/T 7714 等参考文献格式。
- 不提供正式参考文献管理或论文引用工作流。
- 不提供 LaTeX 论文工程。
- 不提供页眉、页脚、分页、页面尺寸和精确印刷排版。
- 不提供任意字体、字号和文字颜色。
- 不提供 Word 双向无损导入。
- 不提供多人实时协作和修订模式。
- 不提供自由绘图、流程图、嵌入网页或代码执行环境。
- 不提供应用级备份、回收站或历史版本。

## 3. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 一级入口 | 新增“写作”，与“阅读”“知识库”并列 |
| 文档类型 | 所有内容都是同一种通用文档 |
| 新建流程 | 点击新增后直接进入空白文档，不显示向导 |
| 编辑体验 | 纯语义富文本，支持 Markdown 快捷输入与即时转换 |
| Markdown 源码 | 转换后不重新显示；不提供整篇源码模式 |
| 数据权威 | Lumina 内部结构化 JSON |
| 页面背景 | 编辑区铺满中间区域并跟随当前主题 |
| 文档组织 | 默认平铺，支持搜索、收藏和可选文件夹 |
| AI 面板 | 复用论文阅读 AI 窗口的通用外壳，按需展开 |
| AI 编辑 | 光标/选区/章节/全文；原位差异；接受后写入 |
| 本地数据 | 自动保存；不做云同步 |
| 删除 | 永久删除，不进入回收站 |
| 版本 | 不保留历史版本；撤销/重做仅限当前编辑会话 |
| 导出 | 通用 Markdown、DOCX、PDF |

## 4. 技术选型

### 4.1 推荐方案

编辑器使用 Tiptap 3 + ProseMirror：

- `@tiptap/core`
- `@tiptap/react`
- `@tiptap/pm`
- `@tiptap/starter-kit`
- 开源数学、表格、任务列表、链接、图片、下划线、高亮等扩展
- 项目已有 `katex`
- `lowlight`，用于代码块语法高亮
- `docx`，用于 DOCX 输出

Tiptap JSON 是唯一权威编辑内容。Markdown 只用于快捷输入和导出，不作为持久化源。

### 4.2 选择理由

- 与现有 React 19 Renderer 直接集成。
- ProseMirror Schema 可以严格限制可保存内容。
- Transaction 适合统一编辑、撤销和自动保存。
- Decoration 可以实现 AI 建议的非破坏性原位预览。
- 自定义 Node View 适合公式、图片、表格和脚注。
- 稳定块 ID 可以同时支持大纲、AI 锚点和冲突检测。

### 4.3 未选择方案

Milkdown 更适合 Markdown-first 编辑器，与结构化 JSON 权威数据不一致。Lexical 具备良好
性能和 React 支持，但公式、差异建议、复杂导出和文档 Schema 需要更多自研工作。

官方 `@tiptap/markdown` 当前仍为 Beta，存在复杂表格等往返限制，不作为首期核心依赖。
Markdown 导出通过 Lumina 自有映射层完成。

## 5. 页面信息架构

### 5.1 一级导航

`ViewMode` 扩展为：

```ts
type ViewMode = 'paper' | 'knowledge' | 'writer'
```

一级侧栏新增“写作”导航项。写作视图下的全局新增按钮直接创建空白文档。

`App.tsx` 继续使用 `currentView` 条件渲染并懒加载 `WritingPage`，不引入路由库。

### 5.2 写作视图侧栏内容

写作视图在现有单级 `SidebarShell` 的内容区提供：

- 新建文档
- 文档搜索
- 文档/大纲分段切换
- 收藏文档
- 最近文档
- 全部文档
- 可选文件夹
- 重命名、移动和永久删除

默认直接显示文档列表。文件夹是可选组织能力，不要求用户创建项目或先选择目录。
删除文件夹时，其中的文档全部移回根层级；只有对单篇文档执行永久删除，才会删除正文与
资源。

大纲与文档列表共享左侧区域，通过分段控件切换。大纲只从标题节点派生，不保存第二份
手工目录。

### 5.3 中间编辑区

中间区域从顶部工具区到底部状态区全部属于文档表面：

- 不使用白纸卡片。
- 不使用文档外框、圆角或纸张投影。
- 不在文档四周保留深色画布。
- 编辑表面使用 `--sm-color-bg-canvas`。
- 正文文字、次级文字、分隔和选区使用主题 token。
- 内容使用响应式内边距。
- 文字内容最大行宽约 760–800px，避免宽屏行长过长。
- AI 面板关闭后，编辑表面直接延伸到窗口右侧。

暗色模式显示暗色编辑表面，亮色模式显示亮色编辑表面。应用主题不会影响 DOCX/PDF 的
固定打印样式。

### 5.4 顶部与底部

顶部保持克制，只显示：

- 文档标题
- 保存状态
- 导出
- AI 面板入口
- 更多菜单

版本历史、备份和回收站不存在。更多菜单只承载移动、收藏、导出和永久删除等低频操作。

底部只显示轻量统计，例如字数和行数。

### 5.5 按需工具

- 选中文字时显示浮动格式栏。
- 空行输入 `/` 时显示插入菜单。
- 点击图片、表格和公式时显示对应节点工具。
- 双击公式时显示小型 LaTeX 编辑浮层。
- AI 侧栏默认关闭。
- 写作侧栏沿用现有折叠与宽度调整模式。

## 6. 编辑器内容模型

### 6.1 文档标题

标题是 `WriterDocument.title` 元数据，不属于 Tiptap 正文 JSON。界面将标题输入与正文视觉
连成一个表面，导出时由映射层将标题作为文档顶级标题写入输出。

这样可以避免从正文解析文件名，也能让侧栏重命名与编辑区标题保持单一权威。

### 6.2 节点

首期允许的块级节点：

- paragraph
- heading，级别 1–6
- blockquote
- bulletList
- orderedList
- taskList
- taskItem
- codeBlock
- horizontalRule
- image
- imageCaption
- table
- tableRow
- tableHeader
- tableCell
- blockMath
- footnoteDefinition
- hardBreak

首期允许的行内节点：

- text
- inlineMath
- footnoteReference

所有需要稳定定位的块级节点都保存 `nodeId`。表格单元格等可独立编辑的文本容器也保存稳定
ID，以支持 AI 选区和冲突检测。

### 6.3 Marks

首期允许：

- bold
- italic
- underline
- strike
- highlight，单一主题化语义高亮
- code
- link

不保存任意字体、字号、前景色和背景色。粘贴的对应样式会被移除。

### 6.4 Markdown 输入转换

块级语法在光标离开当前文本块后才转换（输入期间保持源码显示）；行内语法在闭合符输入完成时即时转换。

延迟转换（离块触发）：

| 输入 | 转换结果 |
|---|---|
| `# ` 至 `###### ` | 标题 |
| `> ` | 引用块 |
| `- `、`* ` | 无序列表 |
| `1. ` | 有序列表 |
| `- [ ] ` | 任务列表 |
| 三个反引号 | 代码块 |
| `---` | 分隔线 |

即时转换（闭合符触发）：

| 输入 | 转换结果 |
|---|---|
| `**text**` | 粗体 |
| `_text_` | 斜体 |
| `~~text~~` | 删除线 |
| `$...$` | 行内公式 |
| 独立一行 `$$...$$` | 块级公式 |

转换完成后不重新展示 Markdown 标记。任何情况下不转换光标所在块（含自动保存期间），
落盘前会兜底转换其余待转换行。IME composition 期间禁止运行转换规则，避免破坏
中文、日文和韩文输入。详细设计见 `2026-07-27-writer-deferred-markdown-conversion-design.md`。

### 6.5 粘贴

- 富文本通过 ProseMirror Schema 白名单解析。
- 字体、字号、颜色、内联事件和未知 HTML 被移除。
- 普通文本按普通内容粘贴。
- 剪贴板明确提供 `text/markdown` 时解析 Markdown。
- 另提供“粘贴为 Markdown”命令。
- 图片进入资源导入流程，不保存剪贴板 Base64。

## 7. 通用内容能力

### 7.1 公式

- 支持行内与独立公式。
- 使用 LaTeX 字符串作为节点属性。
- 使用现有 KaTeX 即时渲染。
- 双击公式打开小型编辑浮层。
- 编辑浮层同时显示源码、预览和错误。
- 解析失败时保留源码，不删除节点。
- 公式保留可供辅助技术读取的 LaTeX 文本。

### 7.2 图片

- 支持粘贴、拖放和文件选择。
- 支持 PNG、JPEG、WebP 和 GIF。
- 首期不接受 SVG，避免脚本和外部资源风险。
- 单张图片硬限制为 20MB，超限时在复制前拒绝并提示。
- 支持替代文本、说明文字、宽度和对齐。
- 图片复制到当前文档 `assets/`。
- 使用内容哈希在单篇文档内去重。
- 编辑会话存续期间不清理孤儿资源，保证撤销后图片仍可显示。
- 文档关闭或应用下次启动时，清理当前正文未引用的资源。

### 7.3 表格

- 支持添加和删除行列。
- 支持表头。
- 支持单元格对齐。
- 窄窗口使用横向滚动。
- 不支持合并单元格、嵌套表格和公式计算。

### 7.4 代码

- 支持行内代码与代码块。
- 代码块支持语言选择、语法高亮和复制。
- 使用 `lowlight` 并只注册常用语言，避免无边界增加包体。
- 不运行代码，不提供终端或沙箱。

### 7.5 脚注与大纲

- 脚注引用与脚注定义使用稳定 ID 关联。
- 编号按正文出现顺序实时派生。
- 点击引用与定义可以双向跳转。
- 大纲由标题节点实时派生并支持点击跳转。

## 8. 文档数据与存储

### 8.1 路径

```text
~/.lumina/writing/
  index.json
  documents/
    <documentId>/
      document.json
      assets/
```

不存在 `trash/`、`revisions/` 或 `backups/`。

### 8.2 文档类型

```ts
interface WriterDocument {
  schemaVersion: number
  id: string
  revision: number
  title: string
  content: TiptapJsonDocument
  folderId?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}
```

`document.json` 是正文与文档元数据的权威来源。
`revision` 只是乐观并发与保存顺序计数器，不保存旧内容，也不构成历史版本。

`index.json` 保存：

- 文件夹定义与排序
- 文档摘要缓存
- 最近打开顺序

文档摘要缓存可以从 `document.json` 重建。索引与文档冲突时，文档文件中的标题、收藏、
文件夹和更新时间优先。

### 8.3 自动保存

1. ProseMirror Transaction 发生后立即标记为未保存。
2. 停止输入约 600ms 后发送保存请求。
3. 请求包含 `expectedRevision`。
4. 主进程使用 Zod 校验文档。
5. 主进程生成 `expectedRevision + 1` 的完整文档，先写同目录临时文件，再原子替换
   `document.json`。
6. 保存成功后返回新的修订号。
7. 文档切换、窗口失焦和退出前强制刷新。

保存失败时不清除未保存状态，也不丢弃 Renderer 内存中的最新内容。界面显示“保存失败，
正在重试”。

应用启动时可以检查上次异常退出遗留的临时文件。只有结构完整、文档 ID 匹配且修订号更高
的临时文件才会提升为正式文件；无效临时文件直接删除。这属于写入完整性保护，不构成历史
版本或备份。

### 8.4 撤销与删除

- 撤销/重做只存在于当前编辑器会话。
- 关闭并重新打开文档后不能恢复旧内容。
- 接受一组 AI 建议作为单个撤销步骤。
- 删除前使用通知中心显示“不可撤销”的危险确认。
- 确认后永久删除整个文档目录，包括正文和所有资源。
- 删除失败时保留索引记录并显示错误，避免列表与磁盘状态不一致。

### 8.5 Schema 迁移

每个文档保存 `schemaVersion`。迁移函数必须是纯函数并通过测试。

由于产品明确不保留备份，迁移采用保守策略：

- 先在内存中完成全部迁移与校验。
- 只有最终文档通过新 Schema 校验后才原子替换原文件。
- 任一步失败都不写回原文件。
- 不创建长期迁移备份。

## 9. 进程与模块边界

### 9.1 Shared

新增：

```text
src/shared/types/writer.ts
```

包含文档、索引、文件夹、资源、导出、AI 锚点和 AI 建议契约。

### 9.2 Main

新增：

```text
src/main/services/writer/
  WriterService.ts
  WriterStorageService.ts
  WriterAssetService.ts
  WriterExportService.ts
  WriterDocumentMapper.ts
  writerPaths.ts
```

职责：

- `WriterService`：编排入口。
- `WriterStorageService`：索引、创建、读取、保存、删除和迁移。
- `WriterAssetService`：图片导入、哈希、验证、协议定位和垃圾回收。
- `WriterExportService`：Markdown、DOCX、PDF 导出。
- `WriterDocumentMapper`：Tiptap JSON 到稳定导出 AST。

服务遵循 Result 模式，不向 IPC 抛出业务异常。

### 9.3 IPC

新增：

```text
src/main/ipc/handlers/writerHandlers.ts
```

通道覆盖：

- listDocuments
- createDocument
- getDocument
- saveDocument
- deleteDocument
- renameDocument
- moveDocument
- setFavorite
- createFolder
- renameFolder
- deleteFolder
- importAsset
- exportDocument

保存接口携带 `expectedRevision`。修订冲突必须显式返回，不能静默覆盖。

### 9.4 Preload

新增：

```text
src/preload/apis/writer.ts
src/preload/types/writer.ts
```

通过 `window.api.writer.*` 暴露最小 API。Renderer 不直接导入 Node 模块。

### 9.5 Renderer

新增：

```text
src/renderer/src/pages/WritingPage.tsx
src/renderer/src/components/writer/
src/renderer/src/stores/writer/
```

Store 边界：

- `WriterLibraryStore`：列表、文件夹、收藏和搜索。
- `WriterSessionStore`：当前文档、修订、脏状态和保存状态。
- `WriterSuggestionStore`：AI 建议集、接受、拒绝和失效状态。
- `WriterChatStore`：写作会话与流式状态。

完整编辑器内容不逐字符复制到 Zustand。Tiptap EditorState 保持在编辑器实例中，Store 只保存
文档 ID、状态和必要摘要。

## 10. 本地资源协议

扩展现有协议：

```text
lumina://writing/<documentId>/assets/<assetPath>
```

必须执行：

- 文档 ID 格式校验
- 路径规范化
- 资源必须位于对应 `assets/`
- 路径穿越防护
- MIME 与扩展名白名单
- 禁止 HTML、脚本和可执行文件
- 正确的内容类型和缓存头

协议扩展沿用现有 `lumina://` CSP，不新增外部来源。

## 11. AI 文档编辑

### 11.1 UI 复用

将论文 AI 面板可复用部分抽为：

```text
AssistantPanelShell
  ├─ PaperChatPanel
  └─ WriterChatPanel
```

复用：

- 面板宽度与折叠
- 消息列表
- 输入区
- 附件展示
- 工具调用展示
- 流式状态
- 停止按钮

不复用论文 ID、论文上下文和论文专用 Store。

### 11.2 编辑范围

每次请求必须明确选择：

- cursor
- selection
- section
- document

AI 不自行扩大范围。论文与知识库只有在用户主动选择时才作为当前请求的普通素材上下文。
写作文档不会自动加入知识库，也不会自动建立向量索引。

首期 AI 只编辑正文，不修改独立的文档标题元数据。

### 11.3 锚点

```ts
interface WriterAiAnchor {
  documentId: string
  baseRevision: number
  scope: 'cursor' | 'selection' | 'section' | 'document'
  startBlockId: string
  endBlockId: string
  startOffset: number
  endOffset: number
  expectedTextHash: string
}
```

锚点在 AI 请求期间通过后续 ProseMirror Transaction 映射新位置。

### 11.4 建议操作

模型不能返回任意 Tiptap JSON，也不能直接保存文件。新增 `WriterToolAdapter`，仅允许：

```ts
type WriterEditOperation =
  | InsertTextOperation
  | ReplaceTextOperation
  | DeleteTextOperation
  | InsertBlocksOperation
  | ReplaceBlocksOperation
```

可生成的块限制为标题、段落、列表、引用、代码和公式。

AI 可以修改已有表格单元格、图片说明和替代文本中的选定文本，但首期不能创建、删除、
移动图片或改变表格结构。

### 11.5 验证

显示建议前必须全部通过：

- Zod 结构校验
- 文档 ID 与文档会话谱系检查
- 节点 ID 存在性
- 范围越界检查
- 原文本哈希
- 操作重叠检查
- 编辑器 Schema 校验
- 长度与节点数量限制

任一操作失败时不显示部分结果。系统允许要求模型修正一次，仍失败则提示用户重新生成。

`baseRevision` 用于识别请求来自当前打开的文档会话，并拒绝文档切换、重新加载或外部修订
冲突；它不要求建议返回时当前修订号仍与请求时完全相等。AI 等待期间由当前编辑器产生的
Transaction 会持续映射锚点，只要目标节点和 `expectedTextHash` 仍匹配，目标范围外的正常
编辑不会让建议失效。

### 11.6 原位差异

建议使用 Decoration 显示，不修改真实文档：

- 新增：主题化绿色高亮。
- 删除：主题化红色背景与删除线。
- 替换：旧内容删除线 + 新内容高亮。
- 块级新增：在目标位置显示临时块。

支持逐项接受/拒绝和全部接受/拒绝。全部接受作为一个 Transaction 和一个撤销步骤。

### 11.7 冲突

- AI 工作期间不冻结全文。
- 用户可以编辑目标范围外内容。
- 目标范围自身变化时，对应建议失效。
- 失效建议只能根据最新内容重新生成。
- 不做模糊文本匹配或强制套用。
- 切换文档会取消当前未完成请求。
- 未接受建议不保存。

## 12. 导出

### 12.1 中间层

```text
Tiptap JSON
  → WriterExportDocument
    ├─ MarkdownRenderer
    ├─ DocxRenderer
    └─ PrintHtmlRenderer → PDF
```

所有导出共享 `WriterExportDocument`。输出器不能各自解释 Tiptap 内部节点。

### 12.2 Markdown

- 输出 `.md`。
- 图片复制到同名 `.assets` 目录。
- 图片链接使用相对路径。
- 公式输出 `$...$` 和 `$$...$$`。
- 表格输出 GFM。
- 脚注输出 Markdown 脚注语法。
- 任务列表使用 GFM 任务语法。
- 无法表示的内容必须输出可读降级，不静默丢失。

### 12.3 DOCX

- 使用 `docx`。
- 映射标题、段落、文本 Marks、列表、任务、引用、表格、代码、图片和脚注。
- 使用固定通用文档样式。
- 不继承应用明暗主题。
- 首期公式由离屏 KaTeX 打印渲染生成高分辨率 PNG，并携带 LaTeX 替代文本。
- 公式渲染失败时输出可读 LaTeX 文本并记录导出警告，不静默丢失。
- 不承诺公式在 Word 中继续作为原生公式编辑。

### 12.4 PDF

- 生成不加载网络资源的独立打印 HTML。
- 使用 KaTeX 和代码高亮。
- 使用隐藏 `BrowserWindow`。
- 调用 `webContents.printToPDF`。
- 使用固定浅色打印样式。
- 导出结束后销毁隐藏窗口和临时文件。

### 12.5 原子导出

导出先写临时目标，全部成功后再移动到最终路径。失败时删除临时文件，不修改原文，也不
留下半成品。

## 13. 启动与退出

启动：

- 初始化写作目录。
- 校验或重建 `index.json`。
- 检查并处理原子保存遗留临时文件。
- 不预加载所有正文。

`initializeWriterService()` 在文件服务初始化完成后、创建主窗口前执行。

退出：

- Writer 保存队列加入统一 `requestShutdown` 清理任务。
- 沿用现有 5 秒任务超时。
- 未完成导出被取消并清理临时产物。

## 14. 错误处理

- 加载失败：保持原文件不动，不用空文档覆盖。
- 索引损坏：扫描文档元数据重建。
- 正文损坏：提示无法打开并记录日志；不承诺恢复。
- 保存失败：保持脏状态与内存内容，显示重试状态。
- 修订冲突：停止自动覆盖并要求重新加载。
- 图片导入失败：移除临时占位并显示原因。
- 导出失败：清理临时产物，原文不受影响。
- AI 失败：移除未完成建议，正文不受影响。
- 永久删除：危险确认后执行，成功后明确提示不可恢复。

## 15. 性能

- 文档列表超过阈值后使用现有 `@tanstack/react-virtual`。
- 正文不虚拟化，避免破坏光标、选区和 IME。
- 图片使用懒加载和显示尺寸限制。
- 自动保存防抖，保存、资源和导出在主进程执行。
- Store 只订阅必要切片。
- AI 全文请求按标题和块切分，避免无界上下文。
- 导出分阶段构建，不阻塞 Renderer。
- 超大文档显示性能提示，但不突然拒绝保存。

首期目标：

- 普通文档打开后 800ms 内可输入。
- 连续输入无可感知卡顿。
- 1000 篇文档的侧栏搜索与滚动流畅。
- 20MB 以内图片导入不阻塞编辑界面。
- 自动保存不改变光标、选区或输入法状态。

## 16. 可访问性

- IME composition 期间不触发 Markdown 规则。
- 使用语义标题、列表、表格和引用节点。
- 所有工具支持键盘操作。
- 浮动工具与 `/` 菜单具有正确焦点管理。
- Escape 关闭浮层并恢复编辑器焦点。
- 图片支持替代文本。
- 公式保留 LaTeX 可访问文本。
- 保存与 AI 状态通过可访问状态区域播报。
- 明暗主题下选区和 AI 差异色保持可读对比度。
- 遵守现有 `prefers-reduced-motion`。

## 17. 安全

- Renderer 不直接访问 Node 文件系统。
- 粘贴内容通过 Schema 白名单。
- AI 内容不能注入任意 HTML。
- 图片协议执行路径穿越与 MIME 防护。
- 打印 HTML 不加载网络资源。
- 文件名和导出路径规范化。
- 永久删除必须将文档 ID 解析为已知文档目录，禁止使用未验证路径、环境变量或通配符。

## 18. 测试

新增 `yarn test:writer`，继续使用 `node:test` 与 `tsAliasLoader`。

覆盖：

- 文档 Schema 和迁移
- 创建、读取、自动保存、修订冲突和永久删除
- 索引重建
- 原子写入临时文件恢复
- 图片导入、去重、路径、MIME 与资源清理
- Markdown 输入规则和 IME 边界
- 公式、表格、脚注和图片节点序列化
- AI 操作校验、冲突和失效
- 接受/拒绝建议及单事务撤销
- Markdown 导出
- DOCX ZIP 和关键 OOXML 节点
- PDF 文件头与失败清理
- Zustand Store 状态转换

人工验证：

- 明暗主题
- macOS 与 Windows 窗口控制
- 中文输入法
- 复制粘贴与撤销重做
- 图片拖放、表格操作和公式编辑
- AI 四种范围
- AI 生成期间编辑非目标区域
- 保存、模型和导出失败
- 永久删除
- Markdown、DOCX、PDF 实际打开

## 19. 实施阶段

1. 导航、类型、存储、IPC、侧栏和基础编辑器。
2. 富文本节点、Markdown 输入规则、公式、图片、表格和脚注。
3. 通用 AI 面板抽取、写作上下文和原位差异建议。
4. Markdown、DOCX 和 PDF 导出。
5. 性能、IME、可访问性、安全与跨平台验证。

详细任务拆分、测试先行顺序和提交边界由后续 implementation plan 确定。

## 20. 验收标准

- 用户从任意工作区一次点击创建空白文档。
- 用户无需理解 Markdown 即可完成常用编辑。
- Markdown 快捷输入在非 IME 状态下正确即时转换。
- 编辑区无纸张卡片和外层黑边，并跟随当前主题。
- 公式、图片、表格、代码和脚注可以创建、编辑、保存并重新打开。
- 文档列表支持搜索、收藏和可选文件夹。
- 自动保存失败不会静默丢失内存内容。
- 关闭后重新打开得到最后一次成功保存内容。
- AI 可以在光标、选区、章节或全文生成受限建议。
- AI 建议在正文原位高亮，未接受前不修改权威文档。
- 失效建议不能强制套用。
- 接受一组 AI 建议可以在当前会话一次撤销。
- Markdown、DOCX 和 PDF 导出可被常用程序打开。
- 永久删除会移除正文和资源，不存在回收站、版本或应用备份。
- 界面和功能中不出现论文格式、正式引用或参考文献管理概念。
