const session = {
  invalidSessionId: '无效的会话 ID',
  sessionNotFound: '会话不存在',
  illegalSessionId: '非法的会话 ID: {{sessionId}}',
  validateTitleType: '标题必须是字符串',
  validateTitleTooLong: '标题长度不能超过 {{max}} 个字符',
  validateMessagesType: '消息必须是数组',
  validateMessagesEmpty: '消息数组不能为空',
  validateMessageStructure: '消息结构无效',
  validateMetaPatchType: '元数据补丁必须是对象',
  initFailed: '会话服务初始化失败: {{detail}}',
  saveFailed: '会话保存失败: {{detail}}',
  appendMessagesFailed: '追加消息失败: {{detail}}',
  updateMetaFailed: '更新会话元数据失败: {{detail}}',
  deleteFailed: '会话删除失败: {{detail}}',
  writerResourceRefRequired: '写作会话必须提供 kind 为 writer 的 resourceRef',
  factoryNotFound: '未找到类型为 {{type}} 的会话工厂'
}

export default session
