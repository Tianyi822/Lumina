# 大文件重构优化方案

本文档针对项目中代码行数超过 800 行的文件进行分析，并提出具体的优化建议。

## 概览

### 超过 1000 行的文件（高/中优先级）

| 行数 | 文件 | 类型 | 优先级 |
|------|------|------|--------|
| 2170 | `DockerService.ts` | 主进程服务 | 高 |
| 1937 | `index.d.ts` | 预加载类型声明 | 低 |
| 1711 | `MessageInput.vue` | Vue 组件 | 中 |
| 1663 | `KnowledgeMain.vue` | Vue 组件 | 中 |
| 1610 | `DocumentExportService.ts` | 主进程服务 | 中 |
| 1593 | `PptContentParser.ts` | 主进程服务 | 中 |
| 1414 | `PptExportService.ts` | 主进程服务 | 中 |
| 1342 | `PptTemplateAnalyzer.ts` | 主进程服务 | 中 |
| 1252 | `ChatMessage.vue` | Vue 组件 | 中 |
| 1114 | `SandboxToolService.ts` | 主进程服务 | 中 |
| 1054 | `creatorStore.ts` | Pinia Store | 中 |

### 800-1000 行的文件（需关注）

| 行数 | 文件 | 类型 | 备注 |
|------|------|------|------|
| 998 | `PptGenerator.ts` | 主进程服务 | 即将超限 |
| 913 | `PptTemplateSettings.vue` | Vue 组件 | 设置页面 |
| 889 | `SandboxMainContent.vue` | Vue 组件 | 沙箱主内容 |
| 869 | `SandboxCreator.vue` | Vue 组件 | 沙箱创建器 |
| 838 | `sandbox.ts` | 类型定义 | 沙箱类型 |
| 831 | `ChatService.ts` | 主进程服务 | 聊天核心 |
| 815 | `FileSelectorModal.vue` | Vue 组件 | 文件选择 |
| 814 | `sandboxHandlers.ts` | IPC 处理器 | 沙箱 IPC |
| 803 | `FileManagerModal.vue` | Vue 组件 | 文件管理 |
| 800 | `sandboxStore.ts` | Pinia Store | 沙箱状态 |

---

## 一、主进程服务

### 1. DockerService.ts（2170 行）- 高优先级

**问题分析**

该文件是最大的源文件，包含 Docker 操作的所有逻辑：
- 容器生命周期管理（创建、启动、停止、删除）
- 容器信息查询（列表、详情、状态）
- Docker Compose 操作（up、down、restart、logs）
- 容器执行命令
- 网络管理
- 日志获取
- 资源统计

**优化方案**

按职责拆分为多个服务文件：

```
src/main/services/sandbox/
├── DockerService.ts          # 核心连接和基础操作（~300 行）
├── DockerContainerService.ts # 容器管理（~400 行）
├── DockerComposeService.ts   # Compose 操作（~500 行）
├── DockerExecService.ts      # 命令执行（~300 行）
├── DockerNetworkService.ts   # 网络管理（~200 行）
├── DockerStatsService.ts     # 资源统计（~200 行）
└── types.ts                  # 共享类型定义（~200 行）
```

| 新文件 | 职责 | 包含方法 |
|--------|------|----------|
| `DockerService.ts` | 核心初始化、连接管理 | `initialize`, `checkAvailable`, `getDocker` |
| `DockerContainerService.ts` | 容器 CRUD | `listContainers`, `getContainer`, `createContainer`, `startContainer`, `stopContainer`, `removeContainer` |
| `DockerComposeService.ts` | Compose 操作 | `composeUp`, `composeDown`, `composeRestart`, `composeLogs`, `composeExec` |
| `DockerExecService.ts` | 命令执行 | `execInContainer`, `execComposeCommand` |
| `DockerNetworkService.ts` | 网络管理 | `getNetworkInfo`, `listNetworks` |
| `DockerStatsService.ts` | 资源监控 | `getContainerStats`, `getContainerLogs` |

---

### 2. DocumentExportService.ts（1610 行）- 中优先级

**问题分析**

该服务处理多种格式的文档导出：
- Word (.docx) 导出（表格、列表、代码块、引用）
- Markdown 解析（行内样式、链接、图片）
- PPT 导出协调
- 格式转换

**优化方案**

按导出格式拆分：

```
src/main/services/document/
├── DocumentExportService.ts      # 主服务，协调各导出器（~200 行）
├── exporters/
│   ├── WordExporter.ts           # Word 导出（~500 行）
│   ├── MarkdownExporter.ts       # Markdown 导出（~200 行）
│   └── PdfExporter.ts            # PDF 导出（如果需要）
├── parsers/
│   └── MarkdownParser.ts         # Markdown 解析（~300 行）
└── types.ts                      # 共享类型（~100 行）
```

---

### 3. PptContentParser.ts（1593 行）- 中优先级

**问题分析**

该解析器包含多种解析策略：
- 页码规划解析（按预期页数拆分）
- H1 标题拆分
- H2 标题拆分
- 表格解析
- 列表解析
- 内容块解析

**优化方案**

按解析策略拆分：

```
src/main/services/presentation/parsers/
├── PptContentParser.ts           # 主解析器，策略选择（~200 行）
├── PagePlanParser.ts             # 页码规划解析（~300 行）
├── H1HeaderParser.ts             # H1 标题拆分（~200 行）
├── H2HeaderParser.ts             # H2 标题拆分（~200 行）
├── BlockParser.ts                # 内容块解析（~300 行）
└── types.ts                      # 解析器类型（~100 行）
```

**策略模式实现：**

```typescript
interface ParseStrategy {
  canHandle(lines: string[]): boolean
  parse(lines: string[], options: PptParseOptions): ParsedSlide[]
}

const strategies: ParseStrategy[] = [
  new PagePlanStrategy(),
  new H1HeaderStrategy(),
  new H2HeaderStrategy()
]
```

---

### 4. PptExportService.ts（1414 行）- 中优先级

**问题分析**

该服务职责包括：
- 导出流程协调
- SVG 预览生成
- 模板样式提取
- 幻灯片生成协调
- 常量定义

**优化方案**

```
src/main/services/presentation/
├── PptExportService.ts           # 主服务，协调流程（~300 行）
├── PptPreviewGenerator.ts        # SVG 预览生成（~300 行）
├── PptStyleExtractor.ts          # 样式提取（~200 行）
├── constants.ts                  # 常量定义（~100 行）
└── PptGenerator.ts               # PPT 生成（已存在）
```

---

### 5. PptTemplateAnalyzer.ts（1342 行）- 中优先级

**问题分析**

该分析器处理：
- PPTX 文件解压
- XML 解析
- 幻灯片结构分析
- 元素类型识别（文本、图片、表格、图表）
- 关系映射

**优化方案**

```
src/main/services/presentation/analyzers/
├── PptTemplateAnalyzer.ts        # 主分析器（~300 行）
├── PptxFileReader.ts             # 文件读取和解压（~200 行）
├── SlideAnalyzer.ts              # 幻灯片分析（~300 行）
├── ElementAnalyzer.ts            # 元素分析（~300 行）
├── RelationshipResolver.ts       # 关系解析（~150 行）
└── types.ts                      # 分析器类型（~100 行）
```

---

### 6. PptGenerator.ts（998 行）- 需关注

**问题分析**

PPT 生成器包含：
- 幻灯片渲染（标题页、内容页、结束页）
- 元素生成（文本框、表格、列表）
- 布局计算
- 样式应用
- 模板元素替换

**优化方案**

```
src/main/services/presentation/generators/
├── PptGenerator.ts               # 主生成器（~200 行）
├── SlideRenderer.ts              # 幻灯片渲染（~200 行）
├── ElementRenderer.ts            # 元素渲染（~200 行）
├── LayoutCalculator.ts           # 布局计算（~150 行）
├── TemplateRenderer.ts           # 模板渲染（~150 行）
└── types.ts                      # 类型定义（~100 行）
```

---

### 7. SandboxToolService.ts（1114 行）- 中优先级

**问题分析**

该服务将 Docker 操作封装为 LLM 可调用的工具：
- 工具定义（10+ 个工具）
- 参数验证
- 权限检查
- 结果格式化

**优化方案**

```
src/main/services/sandbox/tools/
├── SandboxToolService.ts         # 主服务，注册工具（~200 行）
├── queryTools.ts                 # 查询类工具（~300 行）
├── managementTools.ts            # 管理类工具（~300 行）
├── execTools.ts                  # 执行类工具（~200 行）
├── toolExecutor.ts               # 工具执行器（~100 行）
└── types.ts                      # 工具类型（~100 行）
```

---

### 8. ChatService.ts（831 行）- 需关注

**问题分析**

聊天核心服务包含：
- 消息发送（直接模式、ReAct 模式）
- 流式响应处理
- 工具调用协调
- 知识库集成
- 停止/中断处理
- 重试逻辑

**优化方案**

```
src/main/services/chat/
├── ChatService.ts                # 主服务，对外接口（~200 行）
├── ReactLoopService.ts           # ReAct 循环逻辑（~200 行）
├── StreamHandler.ts              # 流式响应处理（~150 行）
├── MessageBuilder.ts             # 消息构建（已存在 PromptBuilder）
├── StopController.ts             # 停止控制（~100 行）
└── types.ts                      # 类型定义（~100 行）
```

---

### 9. sandboxHandlers.ts（814 行）- 需关注

**问题分析**

IPC 处理器包含：
- Docker 检测相关处理器
- 沙箱 CRUD 处理器
- 容器操作处理器
- Compose 操作处理器
- 配置管理处理器

**优化方案**

```
src/main/ipc/handlers/sandbox/
├── index.ts                      # 统一注册入口（~100 行）
├── dockerHandlers.ts             # Docker 检测处理器（~100 行）
├── sandboxCRUDHandlers.ts        # 沙箱 CRUD 处理器（~200 行）
├── containerHandlers.ts          # 容器操作处理器（~200 行）
├── composeHandlers.ts            # Compose 操作处理器（~150 行）
└── configHandlers.ts             # 配置管理处理器（~100 行）
```

---

## 二、Vue 组件

### 10. MessageInput.vue（1711 行）- 中优先级

**问题分析**

该组件职责过多：
- 文本输入处理
- 文档上传管理
- 图片上传管理
- MCP 工具选择
- 知识库选择
- 沙箱工具开关
- 拖拽处理
- 导出格式选择
- 快捷回复

**优化方案**

```
src/renderer/src/components/
├── MessageInput.vue              # 主组件，组合各部分（~200 行）
├── message-input/
│   ├── InputTextarea.vue         # 纯文本输入框（~150 行）
│   ├── AttachedDocuments.vue     # 已附加文档列表（~100 行）
│   ├── AttachedImages.vue        # 已附加图片列表（~100 行）
│   ├── ToolSelectionBar.vue      # 工具选择栏（~150 行）
│   └── composables/
│       ├── useFileDragDrop.ts    # 拖拽逻辑（~100 行）
│       ├── useDocumentUpload.ts  # 文档上传逻辑（~150 行）
│       └── useImageUpload.ts     # 图片上传逻辑（~150 行）
```

---

### 11. KnowledgeMain.vue（1663 行）- 中优先级

**问题分析**

该组件包含：
- 文件列表管理
- 搜索功能
- 索引重建
- 嵌入模型配置
- 文件拖拽
- 知识库统计

**优化方案**

```
src/renderer/src/components/
├── KnowledgeMain.vue             # 主组件（~200 行）
├── knowledge/
│   ├── FileListPanel.vue         # 文件列表（~200 行）
│   ├── SearchPanel.vue           # 搜索测试面板（~150 行）
│   ├── StatsPanel.vue            # 统计信息面板（~100 行）
│   ├── EmbeddingModelInfo.vue    # 嵌入模型信息（~100 行）
│   └── composables/
│       ├── useKnowledgeFiles.ts  # 文件管理逻辑（~200 行）
│       ├── useKnowledgeSearch.ts # 搜索逻辑（~150 行）
│       └── useReindex.ts         # 重建索引逻辑（~100 行）
```

---

### 12. ChatMessage.vue（1252 行）- 中优先级

**问题分析**

该组件包含：
- 消息渲染（用户/助手）
- Markdown 渲染
- 流式内容显示
- 推理面板
- 工具调用展示
- 导出选项
- Token 统计

**优化方案**

```
src/renderer/src/components/chat/
├── ChatMessage.vue               # 主组件（~200 行）
├── message/
│   ├── MessageContent.vue        # 消息内容渲染（~200 行）
│   ├── StreamingContent.vue      # 流式内容显示（~150 行）
│   ├── ToolCallDisplay.vue       # 工具调用展示（~200 行）
│   ├── MessageActions.vue        # 消息操作按钮（~100 行）
│   ├── TokenStats.vue            # Token 统计显示（~50 行）
│   └── composables/
│       └── useStreamingReveal.ts # 流式显示逻辑（~150 行）
```

---

### 13. PptTemplateSettings.vue（913 行）- 需关注

**问题分析**

该组件包含：
- 模板列表展示
- 模板上传（拖拽、文件选择）
- 模板删除
- 模板预览
- 消息提示

**优化方案**

```
src/renderer/src/components/settings/
├── PptTemplateSettings.vue       # 主组件（~200 行）
├── ppt-template/
│   ├── TemplateList.vue          # 模板列表（~200 行）
│   ├── TemplateUploader.vue      # 模板上传器（~200 行）
│   ├── TemplatePreview.vue       # 模板预览（~150 行）
│   └── composables/
│       └── useTemplateUpload.ts  # 上传逻辑（~100 行）
```

---

### 14. SandboxMainContent.vue（889 行）- 需关注

**问题分析**

该组件包含：
- 沙箱详情展示
- 容器信息面板
- 终端面板
- 日志面板
- 容器详情面板
- 孤儿沙箱警告

**优化方案**

```
src/renderer/src/components/sandbox/
├── SandboxMainContent.vue        # 主组件（~200 行）
├── sandbox-detail/
│   ├── SandboxHeader.vue         # 沙箱头部信息（~100 行）
│   ├── TabNavigation.vue         # 标签导航（~100 行）
│   └── composables/
│       ├── useContainerLogs.ts   # 日志逻辑（~100 行）
│       └── useSandboxRename.ts   # 重命名逻辑（~100 行）
```

---

### 15. SandboxCreator.vue（869 行）- 需关注

**问题分析**

该组件包含：
- 创建类型选择
- Compose 编辑器
- Dockerfile 编辑器
- 容器选择器
- 保存配置对话框
- 创建流程控制

**优化方案**

```
src/renderer/src/components/sandbox/
├── SandboxCreator.vue            # 主组件（~200 行）
├── creator/
│   ├── CreateTypeSelector.vue    # 创建类型选择（~100 行）
│   ├── CreateActions.vue         # 创建操作按钮（~100 行）
│   └── composables/
│       └── useCreateFlow.ts      # 创建流程逻辑（~150 行）
```

**注意**：ComposeEditor、DockerfileEditor、ContainerSelector 等子组件已存在。

---

### 16. FileSelectorModal.vue（815 行）- 需关注

**问题分析**

该组件包含：
- 标签页切换（现有文件/上传）
- 文件列表
- 搜索过滤
- 拖拽上传
- 文件关联

**优化方案**

```
src/renderer/src/components/knowledge/
├── FileSelectorModal.vue         # 主组件（~200 行）
├── file-selector/
│   ├── ExistingFilesTab.vue      # 现有文件标签页（~200 行）
│   ├── UploadTab.vue             # 上传标签页（~200 行）
│   └── composables/
│       └── useFileSelection.ts   # 文件选择逻辑（~100 行）
```

---

### 17. FileManagerModal.vue（803 行）- 需关注

**问题分析**

该组件包含：
- 文件列表
- 搜索过滤
- 拖拽上传
- 文件删除
- 上传进度

**优化方案**

```
src/renderer/src/components/knowledge/
├── FileManagerModal.vue          # 主组件（~200 行）
├── file-manager/
│   ├── FileList.vue              # 文件列表（~200 行）
│   ├── FileUploader.vue          # 文件上传器（~150 行）
│   └── composables/
│       └── useFileManager.ts     # 文件管理逻辑（~150 行）
```

---

## 三、Pinia Store

### 18. creatorStore.ts（1054 行）- 中优先级

**问题分析**

该 Store 管理沙箱创建器的状态：
- 创建类型选择
- Compose 配置
- Dockerfile 配置
- 端口映射
- 卷挂载
- 环境变量
- 表单验证

**优化方案**

```
src/renderer/src/stores/sandbox/
├── creatorStore.ts               # 主 Store，协调状态（~200 行）
├── composeConfigStore.ts         # Compose 配置（~200 行）
├── dockerfileConfigStore.ts      # Dockerfile 配置（~200 行）
├── portMappingStore.ts           # 端口映射（~150 行）
├── volumeMountStore.ts           # 卷挂载（~150 行）
└── types.ts                      # 共享类型（~100 行）
```

---

### 19. sandboxStore.ts（800 行）- 需关注

**问题分析**

该 Store 包含：
- 沙箱列表管理
- 当前沙箱状态
- 操作日志
- 删除确认
- 操作消息
- 模板管理

**优化方案**

```
src/renderer/src/stores/sandbox/
├── sandboxStore.ts               # 主 Store（~300 行）
├── sandboxListStore.ts           # 列表管理（~200 行）
├── sandboxOperationStore.ts      # 操作状态（~200 行）
└── types.ts                      # 类型定义（~100 行）
```

---

## 四、类型定义

### 20. index.d.ts（1937 行）- 低优先级

**问题分析**

预加载层的类型声明文件，包含所有 API 的 TypeScript 类型定义。

**优化方案**

```
src/preload/types/
├── index.d.ts        # 主入口，导出所有类型
├── config.d.ts       # 配置相关类型
├── chat.d.ts         # 聊天相关类型
├── session.d.ts      # 会话相关类型
├── knowledge.d.ts    # 知识库相关类型
├── sandbox.d.ts      # 沙箱相关类型
├── mcp.d.ts          # MCP 相关类型
├── embedding.d.ts    # 嵌入向量相关类型
├── document.d.ts     # 文档相关类型
└── window.d.ts       # 窗口控制相关类型
```

**注意**：此文件为类型声明，不影响运行时性能，优先级较低。

---

### 21. sandbox.ts（838 行）- 需关注

**问题分析**

沙箱类型定义文件，包含：
- 基础沙箱类型
- 容器相关类型
- Compose 相关类型
- Dockerfile 相关类型
- 配置相关类型

**优化方案**

```
src/shared/types/sandbox/
├── index.ts           # 统一导出
├── sandbox.ts         # 基础沙箱类型（~200 行）
├── container.ts       # 容器相关类型（~200 行）
├── compose.ts         # Compose 相关类型（~200 行）
├── dockerfile.ts      # Dockerfile 相关类型（~150 行）
└── config.ts          # 配置相关类型（~100 行）
```

---

## 实施计划

### 阶段一：DockerService.ts（已完成 ✓）

---

### 阶段二：MessageInput.vue（1711 行）

**目标**：将消息输入组件拆分为更小的可复用单元

**拆分策略**：
```
src/renderer/src/components/
├── MessageInput.vue              # 主组件（~200 行）
├── message-input/
│   ├── InputTextarea.vue         # 纯文本输入框（~150 行）
│   ├── AttachedDocuments.vue     # 已附加文档列表（~100 行）
│   ├── AttachedImages.vue        # 已附加图片列表（~100 行）
│   ├── ToolSelectionBar.vue      # 工具选择栏（~150 行）
│   └── composables/
│       ├── useFileDragDrop.ts    # 拖拽逻辑（~100 行）
│       ├── useDocumentUpload.ts  # 文档上传逻辑（~150 行）
│       └── useImageUpload.ts     # 图片上传逻辑（~150 行）
```

**实施步骤**：
1. 创建 `composables/useFileDragDrop.ts`，提取拖拽相关逻辑
2. 创建 `composables/useDocumentUpload.ts`，提取文档上传逻辑
3. 创建 `composables/useImageUpload.ts`，提取图片上传逻辑
4. 创建 `InputTextarea.vue` 子组件
5. 创建 `AttachedDocuments.vue` 子组件
6. 创建 `AttachedImages.vue` 子组件
7. 创建 `ToolSelectionBar.vue` 子组件
8. 重构主组件，组合各子组件和 composables
9. 测试所有输入功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 200 行
- [ ] 现有功能全部正常
- [ ] 无 TypeScript 错误

**预计工作量**：2-3 天

---

### 阶段三：DocumentExportService.ts（1610 行）

**目标**：按导出格式拆分文档导出服务

**拆分策略**：
```
src/main/services/document/
├── DocumentExportService.ts      # 主服务（~200 行）
├── exporters/
│   ├── WordExporter.ts           # Word 导出（~500 行）
│   ├── MarkdownExporter.ts       # Markdown 导出（~200 行）
│   └── types.ts                  # 导出器类型（~100 行）
├── parsers/
│   ├── MarkdownParser.ts         # Markdown 解析（~300 行）
│   └── types.ts                  # 解析器类型（~100 行）
└── types.ts                      # 共享类型（~100 行）
```

**实施步骤**：
1. 创建 `parsers/MarkdownParser.ts`，提取 Markdown 解析逻辑
2. 创建 `exporters/WordExporter.ts`，提取 Word 导出逻辑
3. 创建 `exporters/MarkdownExporter.ts`，提取 Markdown 导出逻辑
4. 重构主服务，协调各导出器
5. 更新导入路径
6. 测试所有导出格式

**验收标准**：
- [ ] 主服务行数 < 250 行
- [ ] 各导出器行数 < 550 行
- [ ] Word/Markdown 导出功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：2 天

---

### 阶段四：PptContentParser.ts（1593 行）

**目标**：按解析策略拆分 PPT 内容解析器

**拆分策略**：
```
src/main/services/presentation/parsers/
├── PptContentParser.ts           # 主解析器（~200 行）
├── PagePlanParser.ts             # 页码规划解析（~300 行）
├── H1HeaderParser.ts             # H1 标题拆分（~200 行）
├── H2HeaderParser.ts             # H2 标题拆分（~200 行）
├── BlockParser.ts                # 内容块解析（~300 行）
└── types.ts                      # 解析器类型（~100 行）
```

**实施步骤**：
1. 定义 `ParseStrategy` 接口
2. 创建 `PagePlanParser.ts`
3. 创建 `H1HeaderParser.ts`
4. 创建 `H2HeaderParser.ts`
5. 创建 `BlockParser.ts`（表格、列表、混合内容）
6. 重构主解析器，实现策略模式
7. 测试各种 Markdown 格式解析

**验收标准**：
- [ ] 主解析器行数 < 250 行
- [ ] 各策略解析器行数 < 350 行
- [ ] 所有解析策略正常工作
- [ ] 单元测试覆盖主要场景

**预计工作量**：2 天

---

### 阶段五：KnowledgeMain.vue（1663 行）

**目标**：拆分知识库管理组件

**拆分策略**：
```
src/renderer/src/components/
├── KnowledgeMain.vue             # 主组件（~200 行）
├── knowledge/
│   ├── FileListPanel.vue         # 文件列表（~200 行）
│   ├── SearchPanel.vue           # 搜索测试面板（~150 行）
│   ├── StatsPanel.vue            # 统计信息面板（~100 行）
│   ├── EmbeddingModelInfo.vue    # 嵌入模型信息（~100 行）
│   └── composables/
│       ├── useKnowledgeFiles.ts  # 文件管理逻辑（~200 行）
│       ├── useKnowledgeSearch.ts # 搜索逻辑（~150 行）
│       └── useReindex.ts         # 重建索引逻辑（~100 行）
```

**实施步骤**：
1. 创建 `composables/useKnowledgeFiles.ts`
2. 创建 `composables/useKnowledgeSearch.ts`
3. 创建 `composables/useReindex.ts`
4. 创建 `FileListPanel.vue` 子组件
5. 创建 `SearchPanel.vue` 子组件
6. 创建 `StatsPanel.vue` 子组件
7. 创建 `EmbeddingModelInfo.vue` 子组件
8. 重构主组件
9. 测试知识库功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 250 行
- [ ] 文件管理、搜索、重建索引功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：2-3 天

---

### 阶段六：PptExportService.ts（1414 行）

**目标**：拆分 PPT 导出服务的职责

**拆分策略**：
```
src/main/services/presentation/
├── PptExportService.ts           # 主服务（~300 行）
├── PptPreviewGenerator.ts        # SVG 预览生成（~300 行）
├── constants.ts                  # 常量定义（~100 行）
└── types.ts                      # 导出相关类型（~100 行）
```

**实施步骤**：
1. 提取常量到 `constants.ts`
2. 创建 `PptPreviewGenerator.ts`，提取 SVG 预览生成逻辑
3. 重构主服务，协调各模块
4. 更新导入路径
5. 测试 PPT 导出和预览功能

**验收标准**：
- [ ] 主服务行数 < 350 行
- [ ] 预览生成器行数 < 350 行
- [ ] PPT 导出和预览功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1-2 天

---

### 阶段七：PptTemplateAnalyzer.ts（1342 行）

**目标**：拆分 PPT 模板分析器的职责

**拆分策略**：
```
src/main/services/presentation/analyzers/
├── PptTemplateAnalyzer.ts        # 主分析器（~300 行）
├── PptxFileReader.ts             # 文件读取和解压（~200 行）
├── SlideAnalyzer.ts              # 幻灯片分析（~300 行）
├── ElementAnalyzer.ts            # 元素分析（~300 行）
├── RelationshipResolver.ts       # 关系解析（~150 行）
└── types.ts                      # 分析器类型（~100 行）
```

**实施步骤**：
1. 创建 `PptxFileReader.ts`，提取文件解压和读取逻辑
2. 创建 `SlideAnalyzer.ts`，提取幻灯片分析逻辑
3. 创建 `ElementAnalyzer.ts`，提取元素分析逻辑
4. 创建 `RelationshipResolver.ts`，提取关系解析逻辑
5. 重构主分析器
6. 更新导入路径
7. 测试模板分析功能

**验收标准**：
- [ ] 主分析器行数 < 350 行
- [ ] 各子模块行数 < 350 行
- [ ] 模板分析功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：2 天

---

### 阶段八：ChatMessage.vue（1252 行）

**目标**：拆分聊天消息组件

**拆分策略**：
```
src/renderer/src/components/chat/
├── ChatMessage.vue               # 主组件（~200 行）
├── message/
│   ├── MessageContent.vue        # 消息内容渲染（~200 行）
│   ├── StreamingContent.vue      # 流式内容显示（~150 行）
│   ├── ToolCallDisplay.vue       # 工具调用展示（~200 行）
│   ├── MessageActions.vue        # 消息操作按钮（~100 行）
│   ├── TokenStats.vue            # Token 统计显示（~50 行）
│   └── composables/
│       └── useStreamingReveal.ts # 流式显示逻辑（~150 行）
```

**实施步骤**：
1. 创建 `composables/useStreamingReveal.ts`
2. 创建 `MessageContent.vue` 子组件
3. 创建 `StreamingContent.vue` 子组件
4. 创建 `ToolCallDisplay.vue` 子组件
5. 创建 `MessageActions.vue` 子组件
6. 创建 `TokenStats.vue` 子组件
7. 重构主组件
8. 测试消息显示和流式功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 250 行
- [ ] 消息渲染和流式显示正常
- [ ] 无 TypeScript 错误

**预计工作量**：2 天

---

### 阶段九：SandboxToolService.ts（1114 行）

**目标**：按工具类型拆分沙箱工具服务

**拆分策略**：
```
src/main/services/sandbox/tools/
├── SandboxToolService.ts         # 主服务（~200 行）
├── queryTools.ts                 # 查询类工具（~300 行）
├── managementTools.ts            # 管理类工具（~300 行）
├── execTools.ts                  # 执行类工具（~200 行）
├── toolExecutor.ts               # 工具执行器（~100 行）
└── types.ts                      # 工具类型（~100 行）
```

**实施步骤**：
1. 创建 `types.ts`，定义工具相关类型
2. 创建 `queryTools.ts`，提取查询类工具定义
3. 创建 `managementTools.ts`，提取管理类工具定义
4. 创建 `execTools.ts`，提取执行类工具定义
5. 创建 `toolExecutor.ts`，提取工具执行逻辑
6. 重构主服务
7. 测试沙箱工具调用

**验收标准**：
- [ ] 主服务行数 < 250 行
- [ ] 各工具模块行数 < 350 行
- [ ] 所有沙箱工具正常工作
- [ ] 无 TypeScript 错误

**预计工作量**：1-2 天

---

### 阶段十：creatorStore.ts（1054 行）

**目标**：拆分沙箱创建器 Store

**拆分策略**：
```
src/renderer/src/stores/sandbox/
├── creatorStore.ts               # 主 Store（~200 行）
├── composeConfigStore.ts         # Compose 配置（~200 行）
├── dockerfileConfigStore.ts      # Dockerfile 配置（~200 行）
├── portMappingStore.ts           # 端口映射（~150 行）
├── volumeMountStore.ts           # 卷挂载（~150 行）
└── types.ts                      # 共享类型（~100 行）
```

**实施步骤**：
1. 创建 `types.ts`，定义共享类型
2. 创建 `composeConfigStore.ts`
3. 创建 `dockerfileConfigStore.ts`
4. 创建 `portMappingStore.ts`
5. 创建 `volumeMountStore.ts`
6. 重构主 Store，协调各子 Store
7. 更新组件引用
8. 测试沙箱创建流程

**验收标准**：
- [ ] 主 Store 行数 < 250 行
- [ ] 各子 Store 行数 < 250 行
- [ ] 沙箱创建流程正常
- [ ] 无 TypeScript 错误

**预计工作量**：2 天

---

### 阶段十一：PptGenerator.ts（998 行）

**目标**：拆分 PPT 生成器

**拆分策略**：
```
src/main/services/presentation/generators/
├── PptGenerator.ts               # 主生成器（~200 行）
├── SlideRenderer.ts              # 幻灯片渲染（~200 行）
├── ElementRenderer.ts            # 元素渲染（~200 行）
├── LayoutCalculator.ts           # 布局计算（~150 行）
├── TemplateRenderer.ts           # 模板渲染（~150 行）
└── types.ts                      # 类型定义（~100 行）
```

**实施步骤**：
1. 创建 `LayoutCalculator.ts`，提取布局计算逻辑
2. 创建 `ElementRenderer.ts`，提取元素渲染逻辑
3. 创建 `SlideRenderer.ts`，提取幻灯片渲染逻辑
4. 创建 `TemplateRenderer.ts`，提取模板渲染逻辑
5. 重构主生成器
6. 测试 PPT 生成功能

**验收标准**：
- [ ] 主生成器行数 < 250 行
- [ ] 各渲染器行数 < 250 行
- [ ] PPT 生成功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1-2 天

---

### 阶段十二：PptTemplateSettings.vue（913 行）

**目标**：拆分 PPT 模板设置组件

**拆分策略**：
```
src/renderer/src/components/settings/
├── PptTemplateSettings.vue       # 主组件（~200 行）
├── ppt-template/
│   ├── TemplateList.vue          # 模板列表（~200 行）
│   ├── TemplateUploader.vue      # 模板上传器（~200 行）
│   ├── TemplatePreview.vue       # 模板预览（~150 行）
│   └── composables/
│       └── useTemplateUpload.ts  # 上传逻辑（~100 行）
```

**实施步骤**：
1. 创建 `composables/useTemplateUpload.ts`
2. 创建 `TemplateList.vue` 子组件
3. 创建 `TemplateUploader.vue` 子组件
4. 创建 `TemplatePreview.vue` 子组件
5. 重构主组件
6. 测试模板管理功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 250 行
- [ ] 模板上传、删除、预览功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段十三：SandboxMainContent.vue（889 行）

**目标**：拆分沙箱主内容组件

**拆分策略**：
```
src/renderer/src/components/sandbox/
├── SandboxMainContent.vue        # 主组件（~200 行）
├── sandbox-detail/
│   ├── SandboxHeader.vue         # 沙箱头部信息（~100 行）
│   ├── TabNavigation.vue         # 标签导航（~100 行）
│   └── composables/
│       ├── useContainerLogs.ts   # 日志逻辑（~100 行）
│       └── useSandboxRename.ts   # 重命名逻辑（~100 行）
```

**实施步骤**：
1. 创建 `composables/useContainerLogs.ts`
2. 创建 `composables/useSandboxRename.ts`
3. 创建 `SandboxHeader.vue` 子组件
4. 创建 `TabNavigation.vue` 子组件
5. 重构主组件
6. 测试沙箱详情功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 150 行
- [ ] 沙箱详情、终端、日志功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段十四：SandboxCreator.vue（869 行）

**目标**：拆分沙箱创建器组件

**拆分策略**：
```
src/renderer/src/components/sandbox/
├── SandboxCreator.vue            # 主组件（~200 行）
├── creator/
│   ├── CreateTypeSelector.vue    # 创建类型选择（~100 行）
│   ├── CreateActions.vue         # 创建操作按钮（~100 行）
│   └── composables/
│       └── useCreateFlow.ts      # 创建流程逻辑（~150 行）
```

**实施步骤**：
1. 创建 `composables/useCreateFlow.ts`
2. 创建 `CreateTypeSelector.vue` 子组件
3. 创建 `CreateActions.vue` 子组件
4. 重构主组件
5. 测试沙箱创建流程

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 150 行
- [ ] Compose/Dockerfile/容器选择创建流程正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段十五：sandbox.ts（838 行）

**目标**：拆分沙箱类型定义

**拆分策略**：
```
src/shared/types/sandbox/
├── index.ts           # 统一导出（~50 行）
├── sandbox.ts         # 基础沙箱类型（~200 行）
├── container.ts       # 容器相关类型（~200 行）
├── compose.ts         # Compose 相关类型（~200 行）
├── dockerfile.ts      # Dockerfile 相关类型（~150 行）
└── config.ts          # 配置相关类型（~100 行）
```

**实施步骤**：
1. 创建 `sandbox/` 目录
2. 创建 `sandbox.ts`，提取基础沙箱类型
3. 创建 `container.ts`，提取容器相关类型
4. 创建 `compose.ts`，提取 Compose 相关类型
5. 创建 `dockerfile.ts`，提取 Dockerfile 相关类型
6. 创建 `config.ts`，提取配置相关类型
7. 创建 `index.ts`，统一导出
8. 更新所有导入路径
9. 运行类型检查

**验收标准**：
- [ ] 各类型文件行数 < 250 行
- [ ] 所有导入路径正确
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段十六：ChatService.ts（831 行）

**目标**：拆分聊天服务职责

**拆分策略**：
```
src/main/services/chat/
├── ChatService.ts                # 主服务（~200 行）
├── ReactLoopService.ts           # ReAct 循环逻辑（~200 行）
├── StreamHandler.ts              # 流式响应处理（~150 行）
├── StopController.ts             # 停止控制（~100 行）
└── types.ts                      # 类型定义（~100 行）
```

**实施步骤**：
1. 创建 `StopController.ts`，提取停止控制逻辑
2. 创建 `StreamHandler.ts`，提取流式响应处理逻辑
3. 创建 `ReactLoopService.ts`，提取 ReAct 循环逻辑
4. 重构主服务
5. 测试聊天功能（直接模式、ReAct 模式）

**验收标准**：
- [ ] 主服务行数 < 250 行
- [ ] 各子模块行数 < 250 行
- [ ] 聊天、工具调用、停止功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1-2 天

---

### 阶段十七：sandboxHandlers.ts（814 行）

**目标**：拆分沙箱 IPC 处理器

**拆分策略**：
```
src/main/ipc/handlers/sandbox/
├── index.ts                      # 统一注册入口（~100 行）
├── dockerHandlers.ts             # Docker 检测处理器（~100 行）
├── sandboxCRUDHandlers.ts        # 沙箱 CRUD 处理器（~200 行）
├── containerHandlers.ts          # 容器操作处理器（~200 行）
├── composeHandlers.ts            # Compose 操作处理器（~150 行）
└── configHandlers.ts             # 配置管理处理器（~100 行）
```

**实施步骤**：
1. 创建 `sandbox/` 目录
2. 创建 `dockerHandlers.ts`
3. 创建 `sandboxCRUDHandlers.ts`
4. 创建 `containerHandlers.ts`
5. 创建 `composeHandlers.ts`
6. 创建 `configHandlers.ts`
7. 创建 `index.ts`，统一注册所有处理器
8. 更新主进程入口
9. 测试所有沙箱 IPC 调用

**验收标准**：
- [ ] 各处理器文件行数 < 250 行
- [ ] 所有 IPC 调用正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段十八：FileSelectorModal.vue（815 行）

**目标**：拆分文件选择弹窗组件

**拆分策略**：
```
src/renderer/src/components/knowledge/
├── FileSelectorModal.vue         # 主组件（~200 行）
├── file-selector/
│   ├── ExistingFilesTab.vue      # 现有文件标签页（~200 行）
│   ├── UploadTab.vue             # 上传标签页（~200 行）
│   └── composables/
│       └── useFileSelection.ts   # 文件选择逻辑（~100 行）
```

**实施步骤**：
1. 创建 `composables/useFileSelection.ts`
2. 创建 `ExistingFilesTab.vue` 子组件
3. 创建 `UploadTab.vue` 子组件
4. 重构主组件
5. 测试文件选择和上传功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 250 行
- [ ] 文件选择和上传功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段十九：FileManagerModal.vue（803 行）

**目标**：拆分文件管理弹窗组件

**拆分策略**：
```
src/renderer/src/components/knowledge/
├── FileManagerModal.vue          # 主组件（~200 行）
├── file-manager/
│   ├── FileList.vue              # 文件列表（~200 行）
│   ├── FileUploader.vue          # 文件上传器（~150 行）
│   └── composables/
│       └── useFileManager.ts     # 文件管理逻辑（~150 行）
```

**实施步骤**：
1. 创建 `composables/useFileManager.ts`
2. 创建 `FileList.vue` 子组件
3. 创建 `FileUploader.vue` 子组件
4. 重构主组件
5. 测试文件管理功能

**验收标准**：
- [ ] 主组件行数 < 250 行
- [ ] 所有子组件行数 < 250 行
- [ ] 文件列表、上传、删除功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段二十：sandboxStore.ts（800 行）

**目标**：拆分沙箱 Store

**拆分策略**：
```
src/renderer/src/stores/sandbox/
├── sandboxStore.ts               # 主 Store（~300 行）
├── sandboxListStore.ts           # 列表管理（~200 行）
├── sandboxOperationStore.ts      # 操作状态（~200 行）
└── types.ts                      # 类型定义（~100 行）
```

**实施步骤**：
1. 创建 `sandboxListStore.ts`，提取列表管理逻辑
2. 创建 `sandboxOperationStore.ts`，提取操作状态逻辑
3. 重构主 Store
4. 更新组件引用
5. 测试沙箱状态管理

**验收标准**：
- [ ] 主 Store 行数 < 350 行
- [ ] 各子 Store 行数 < 250 行
- [ ] 沙箱列表、操作功能正常
- [ ] 无 TypeScript 错误

**预计工作量**：1 天

---

### 阶段二十一：index.d.ts（1937 行）- 低优先级

**目标**：拆分预加载类型声明文件

**拆分策略**：
```
src/preload/types/
├── index.d.ts        # 主入口（~100 行）
├── config.d.ts       # 配置相关类型（~200 行）
├── chat.d.ts         # 聊天相关类型（~200 行）
├── session.d.ts      # 会话相关类型（~150 行）
├── knowledge.d.ts    # 知识库相关类型（~200 行）
├── sandbox.d.ts      # 沙箱相关类型（~300 行）
├── mcp.d.ts          # MCP 相关类型（~200 行）
├── embedding.d.ts    # 嵌入向量相关类型（~150 行）
├── document.d.ts     # 文档相关类型（~200 行）
└── window.d.ts       # 窗口控制相关类型（~100 行）
```

**实施步骤**：
1. 创建 `types/` 目录
2. 按功能模块拆分类型定义
3. 创建 `index.d.ts`，统一导出所有类型
4. 更新主 `index.d.ts` 为重导出入口
5. 运行类型检查

**验收标准**：
- [ ] 各类型文件行数 < 350 行
- [ ] 类型检查通过
- [ ] IDE 智能提示正常

**预计工作量**：1 天

---

## 通用原则

1. **渐进式重构**：每次只重构一个文件，确保功能正常后再进行下一阶段
2. **保持接口稳定**：对外暴露的 API 不变，只改内部实现
3. **充分测试**：每个阶段完成后进行功能测试
4. **及时提交**：每个阶段完成后单独提交，便于回滚

---

## 进度跟踪

| 阶段 | 文件 | 状态 | 完成日期 |
|------|------|------|----------|
| 1 | DockerService.ts | ✅ 已完成 | - |
| 2 | MessageInput.vue | ⏳ 待开始 | - |
| 3 | DocumentExportService.ts | ⏳ 待开始 | - |
| 4 | PptContentParser.ts | ✅ 已完成 | 2026-03-15 |
| 5 | KnowledgeMain.vue | ⏳ 待开始 | - |
| 6 | PptExportService.ts | ✅ 已完成 | 2026-03-15 |
| 7 | PptTemplateAnalyzer.ts | ⏳ 待开始 | - |
| 8 | ChatMessage.vue | ⏳ 待开始 | - |
| 9 | SandboxToolService.ts | ⏳ 待开始 | - |
| 10 | creatorStore.ts | ⏳ 待开始 | - |
| 11 | PptGenerator.ts | ⏳ 待开始 | - |
| 12 | PptTemplateSettings.vue | ⏳ 待开始 | - |
| 13 | SandboxMainContent.vue | ⏳ 待开始 | - |
| 14 | SandboxCreator.vue | ⏳ 待开始 | - |
| 15 | sandbox.ts | ⏳ 待开始 | - |
| 16 | ChatService.ts | ⏳ 待开始 | - |
| 17 | sandboxHandlers.ts | ⏳ 待开始 | - |
| 18 | FileSelectorModal.vue | ⏳ 待开始 | - |
| 19 | FileManagerModal.vue | ⏳ 待开始 | - |
| 20 | sandboxStore.ts | ⏳ 待开始 | - |
| 21 | index.d.ts | ⏳ 待开始 | - |

---

## 预期收益

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 最大文件行数 | 2170 | ~500 |
| 超过 1000 行的文件数 | 11 个 | 0 个 |
| 超过 800 行的文件数 | 21 个 | 0 个 |
| 平均文件行数 | ~1200 | ~200-300 |
| 代码可维护性 | 低 | 高 |
| 测试覆盖难度 | 高 | 低 |
| 新人上手时间 | 长 | 短 |
