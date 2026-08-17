const embedding = {
  notConfigured: '嵌入模型未配置',
  modelNotFound: '嵌入模型不存在',
  emptyApiResponse:
    '嵌入 API 返回数据为空，请检查 baseUrl、模型名称及接口是否兼容 OpenAI /v1/embeddings 格式',
  baseUrlExcludesEmbeddings:
    '{{message}}。API 基础 URL 应填写到 /v1 为止（例如 http://127.0.0.1:1234/v1），不要包含 /embeddings',
  baseUrlRequiresV1: '{{message}}。API 基础 URL 需包含 /v1（例如 http://127.0.0.1:1234/v1）',
  batchInputEmpty: '批量嵌入输入不能为空',
  inputListEmpty: '输入文本列表不能为空',
  tokenLimitExceeded:
    '单条文本估算 Token 数 {{tokens}} 超过每分钟限制 {{limit}}，请减小知识库分块大小后重试',
  embedFailed: '嵌入向量生成失败: {{reason}}',
  batchEmbedFailed: '批量嵌入向量生成失败: {{reason}}',
  indexingCancelled: '索引操作已被用户取消',
  responseCountMismatch: '嵌入响应数量不匹配，期望 {{expected}} 条，实际收到 {{actual}} 条',
  presetModelNotFound: '未找到预设模型: {{presetId}}',
  modelServiceInitFailed: '嵌入模型管理服务初始化失败: {{reason}}',
  listModelsFailed: '获取嵌入模型列表失败: {{reason}}',
  getModelFailed: '获取嵌入模型失败: {{reason}}',
  saveModelFailed: '保存嵌入模型失败: {{reason}}',
  deleteModelFailed: '删除嵌入模型失败: {{reason}}',
  testModelConnectionFailed: '测试嵌入模型连接失败: {{reason}}',
  getPresetsFailed: '获取预设模型失败: {{reason}}',
  createFromPresetFailed: '创建嵌入配置失败: {{reason}}',
  getConfigFailed: '获取嵌入配置失败: {{reason}}',
  setConfigFailed: '设置嵌入配置失败: {{reason}}',
  testConnectionFailed: '测试嵌入连接失败: {{reason}}',
  embedHandlerFailed: '生成嵌入向量失败: {{reason}}',
  embedBatchHandlerFailed: '批量生成嵌入向量失败: {{reason}}',
  nativeModuleLoadFailed:
    'LanceDB 原生模块加载失败，请确认安装包包含当前系统架构的依赖: {{reason}}',
  chunkVectorCountMismatch: '文档块数量和向量数量不匹配',
  addChunksFailed: '添加文档块失败: {{reason}}',
  deleteFileChunksFailed: '删除文件文档块失败: {{reason}}',
  vectorSearchFailed: '向量搜索失败: {{reason}}'
}

export default embedding
