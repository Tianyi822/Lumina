# 写作编辑器块级 Markdown 延迟转换（离块渲染）设计

- 日期：2026-07-27
- 状态：已批准（用户逐节确认）
- 关联：`2026-07-25-writing-workspace-design.md` §6.4（本设计修订其块级规则的转换时机，实施时同步更新）

## 1. 背景与动机

写作页面当前所有块级 Markdown 输入规则（标题、引用、列表、任务、代码块、分割线）在输入触发符 + 空格（或触发符本身）的瞬间即转换：行内容突然变成标题/列表等渲染态，打断输入节奏。

目标体验（用户确认）：输入触发文本时该行保持 Markdown 源码可见，**光标离开该文本块后**才按语法渲染；转换后保持渲染态，不再显示源码。

## 2. 目标与非目标

### 2.1 目标

- 块级触发文本输入时保持纯文本显示，光标离开该文本块时整块转换并移除触发前缀。
- 任何情况下都不转换光标当前所在块（含后台 autosave 期间）。
- 行内语法维持「闭合符输完即转」现状。
- 落盘的 TipTap JSON 不混入非光标行的 pending 源码行。

### 2.2 非目标

- 不做 Obsidian 式「聚焦已渲染块时还原源码」：转换后不再显示 Markdown 源码。
- 不改变行内语法（粗体/斜体/删除线/行内公式/块公式）的触发时机。
- 不改变各规则的匹配语义与转换结果（节点类型、属性与现状一致）。
- 不涉及粘贴、`setContent` 加载、AI 写入路径。

## 3. 行为规格

### 3.1 规则分类

**延迟转换（光标离开文本块时触发）**：

| 输入（行首前缀） | 离开后转换为 |
|---|---|
| `# ` ~ `###### ` | 标题 1–6 |
| `> ` | 引用块 |
| `- ` / `* ` / `+ ` | 无序列表 |
| `1. ` | 有序列表 |
| `- [ ] ` / `- [x] ` | 任务列表 |
| ` ``` `（可带语言标识） | 代码块 |
| `---` / `***` / `___` | 分割线 |

**保持即时（InputRule，闭合符触发）**：

`**text**`、`*text*`、`_text_`、`~~text~~`、`$...$`、独立行 `$$...$$`。

### 3.2 延迟转换行为细节

- 触发文本输入期间该行保持纯文本（如显示 `# 标题`）；光标离开该文本块（回车换行、方向键移出、鼠标点击别处、拖选离开）后整块转换，触发前缀（如 `# `）被移除。
- 只输入触发符未写内容（如块文本恰为 `### `）即离开 → 转换为空标题，与现行 InputRule 语义一致。
- 转换进入 undo 历史：Ctrl+Z 回到纯文本态，此时光标在块内不会立即重触发，再次离开才转换。
- IME composition 期间不执行任何转换（沿用现有 `eventIsComposing` 保护）。
- 已转换的块再聚焦时保持渲染态。
- 匹配仅限 paragraph 类型 textblock；代码块、其他节点内部天然不参与。

## 4. 技术方案

改动集中在 `src/renderer/src/components/writer/extensions/writerMarkdownRules.ts`，外加 `writerAutosave.ts` 一处调用。不改动 schema、存储、IPC、preload。

### 4.1 规则拆分

- `RULE_DEFINITIONS` 拆分为 `BLOCK_RULES`（7 条延迟规则）与 `INLINE_RULES`（6 条即时规则）。
- `addInputRules()` 仅注册 `INLINE_RULES`，块级规则的空格触发移除。
- 块级正则从「触发符 + 尾随空格精确匹配」改为**行首前缀匹配**（如 `^(#{1,6}) `），兼容「只输触发符」与「触发符 + 内容」两种情况。

### 4.2 离块检测插件

在 `WriterMarkdownRules` 扩展的 `addProseMirrorPlugins()` 中新增插件：

- 插件 state 记录光标上一个所在 textblock 的位置（`prevBlockFrom`），并随每个 transaction 经 `mapping` 映射，防止文档前部变化导致位置漂移。
- 每次 transaction 后对比 selection：若光标所在 textblock 已不同于 `prevBlockFrom`，且未处于 composing，取旧块文本调用 `matchWriterBlockRule()`，命中则 dispatch 转换 transaction。
- 转换 transaction 构造（`buildWriterBlockConversion`）：
  - 标题：删除前缀 + `setNodeMarkup(blockFrom, heading, { level })`。
  - 引用/列表/任务/代码块：将 transaction 选区临时移入旧块，执行现有命令（`toggleBlockquote` / `toggleBulletList` / `toggleOrderedList` / `toggleTaskList` / `setCodeBlock`），再把选区映射回原光标位置（经 `tr.mapping` 防结构变化失效）。
  - 分割线：删除旧块文本并插入 `horizontalRule`。
  - `addToHistory: true`（可撤销）。

### 4.3 持久化兜底

- 新增 `convertAllPendingWriterMarkdownBlocks(editor)`：扫描全文 textblock（仅 paragraph），对匹配块级规则且**非光标所在块**执行转换；返回是否有转换。
- 调用点：`writerAutosave.ts` 每次 save/flush 在 `editor.getJSON()` 序列化前调用一次。退出握手 `flushWriterAutosaveAndAcknowledge` 走同一 flush 路径，自动覆盖。
- 光标所在块的 pending 源码允许落盘为纯文本：下次打开后光标进入再离开即补转换；导出为 Markdown 时该文本恰好仍是合法 Markdown 语法，无害。

### 4.4 纯函数拆分（可测性）

以下逻辑抽为纯函数，无 DOM 依赖（ProseMirror Schema/Node 为纯数据结构）：

- `matchWriterBlockRule(text: string): WriterMarkdownMatch | null`
- `getWriterBlockConversionTarget(prevBlockFrom: number, newState: EditorState): { from: number; text: string } | null`
- `buildWriterBlockConversion(state: EditorState, blockFrom: number, match: WriterMarkdownMatch): Transaction | null`
- `convertAllPendingWriterMarkdownBlocks(editor: Editor): boolean`

### 4.5 数据流

```
输入「### 报告」→ paragraph 纯文本（不转换）
光标移出该块 → 离块检测插件 → matchWriterBlockRule("### 报告") 命中
  → buildWriterBlockConversion → tr（删前缀 + setNodeMarkup heading level 3）
  → 块变为 <h3>报告</h3>
autosave flush → convertAllPendingWriterMarkdownBlocks（跳过光标块）→ editor.getJSON() → IPC save
```

## 5. 错误与边界处理

- **IME**：composing 中不检测、不转换。
- **撤销**：转换入历史；撤销后光标在块内不重触发。
- **代码块内输入 `# `**：仅 paragraph 参与匹配，天然跳过。
- **表格单元格内段落**：与现行 InputRule 语义一致（textblock 即匹配单元），不特殊处理。
- **拖选多块后离开**：以 selection.$from 所在块为准；漏判无副作用（兜底保存时补转非光标行）。
- **pending 行落盘**：仅光标行可能出现，见 §4.3，行为可接受。
- **嵌套列表项内输入触发符**：保持与现行 InputRule 相同命令语义（toggle 行为），本设计不改变其匹配结果。

## 6. 测试设计

沿用 `writerMarkdownRules.test.ts` 纯函数测试模式（node:test + tsAliasLoader，无 DOM）：

- **规则注册**：块级规则不再出现在 `addInputRules()` 结果中；行内规则保持注册。
- **`matchWriterBlockRule`**：7 种前缀模式命中；反例——非行首 `#`、七级 `####### `、代码块段落文本、空触发符。
- **`getWriterBlockConversionTarget`**：光标未离开返回 null；离开返回旧块范围与文本；composing 返回 null。
- **`buildWriterBlockConversion`**：各规则 tr 结果——前缀删除、节点类型/属性正确、选区映射有效。
- **`convertAllPendingWriterMarkdownBlocks`**：pending 行转换、光标所在块跳过、非 paragraph 块跳过。
- 验证命令：`yarn test:writer`、`yarn typecheck`、`yarn lint`。

## 7. 文档同步

实施完成时更新主 spec `2026-07-25-writing-workspace-design.md` §6.4：块级规则由「即时转换」修订为「离块转换」，并指向本文件。
