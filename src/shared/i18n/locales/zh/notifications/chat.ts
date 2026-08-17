const chat = {
  configValidationFailed: '配置验证失败',
  configNotLoaded: '配置未加载',
  modelConfigNotFound: '未找到模型配置: {{modelKey}}',
  modelBusyRetryLater: '模型服务当前繁忙（429），请稍后重试或切换其他模型。原始错误: {{reason}}',
  modelRateLimited: '模型请求过于频繁（429），请稍后重试。原始错误: {{reason}}',
  sessionNotFound: '会话不存在',
  planStepFailed: '步骤 {{index}} 执行失败',
  planStepExecutionFailed: '步骤执行失败',
  planUserCancelled: '用户已取消',
  unknownError: '未知错误',
  unknownWriterTool: '未知的写作工具: {{toolName}}，当前仅支持 propose_edits',
  titleModifyForbidden: '禁止修改文档标题：标题为只读元数据',
  invalidProposalArgs: '编辑建议参数无效: {{issues}}',
  replaceBlocksRequiresTargets: 'replace_blocks 必须提供 targetBlockIds',
  unsupportedEditOperation: '不支持的编辑操作: {{kind}}',
  blockNotInScope: '块 {{blockId}} 不在当前编辑范围内',
  offsetOutOfRange: '块 {{blockId}} 的 offset {{offset}} 越界',
  invalidTextRange: '块 {{blockId}} 的范围 [{{from}}, {{to}}) 无效',
  disallowedBlockType: '不允许的块类型: {{type}}（禁止图片/表格结构变化）',
  insertBudgetExceeded: '插入文本总计超过 {{limit}} 字符上限',
  overlappingEdits: '块 {{blockId}} 上的编辑操作发生重叠',
  duplicateCallBlocked: '[duplicate] 连续重复调用',
  duplicateCallBlockedDetail_one:
    '[duplicate] 连续重复调用 "{{toolName}}" 已达 {{count}} 次，疑似陷入死循环。请改用不同参数或更换思路（例如先检查状态、分步操作或换用其他工具）。',
  duplicateCallBlockedDetail_other:
    '[duplicate] 连续重复调用 "{{toolName}}" 已达 {{count}} 次，疑似陷入死循环。请改用不同参数或更换思路（例如先检查状态、分步操作或换用其他工具）。',
  toolCallOperation: '工具调用 {{toolName}}',
  toolNotFound: '未找到已注册的工具: {{toolName}}',
  toolCallFailed: '工具调用失败',
  parseToolArgsFailed: '解析工具参数失败: {{error}}',
  mcpServerNotFound: '未找到 MCP 服务器: {{serverName}}',
  unknownPaperTool: '未知的论文工具: {{toolName}}，当前仅支持 search_context',
  paperIdNotSet: '论文 ID 未设置，无法检索论文上下文'
}

export default chat
