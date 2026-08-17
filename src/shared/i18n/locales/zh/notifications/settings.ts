const settings = {
  model: {
    validateFailedTitle: '模型配置校验失败',
    validateFieldEmpty: '模型配置"{{name}}"的 {{field}} 不能为空',
    fieldModelName: '模型名称',
    testSuccessTitle: '模型连接测试成功',
    testSuccessMessage: '模型"{{name}}"可用',
    testFailedTitle: '模型连接测试失败',
    testFailedFallback: '连接测试失败'
  },
  embedding: {
    title: '嵌入模型',
    deleted: '嵌入模型已删除',
    deleteFailed: '删除嵌入模型失败',
    testSuccess: '连接测试成功',
    testFailedFallback: '连接测试失败',
    updated: '嵌入模型已更新',
    added: '嵌入模型已添加',
    resaveNote: '编辑后保存为新配置是正常逻辑，原配置不受影响。',
    updateFailed: '更新嵌入模型失败',
    addFailed: '添加嵌入模型失败',
    saveTestConfigFailed: '保存测试配置失败',
    testFailedPrefix: '测试失败: ',
    configSaved: '嵌入模型配置已保存'
  },
  mcp: {
    title: 'MCP 服务',
    validateNameRequired: '请输入服务器名称',
    validateCommandRequired: 'MCP 服务"{{name}}"的执行命令不能为空',
    validateUrlRequired: 'MCP 服务"{{name}}"的服务地址不能为空',
    importJsonRequired: '请输入 MCP 配置 JSON',
    importSuccess_one: '成功导入 {{count}} 个配置',
    importSuccess_other: '成功导入 {{count}} 个配置',
    importFailedPrefix: '导入失败: ',
    validateFailedTitle: '配置校验失败',
    formNameExists: '该名称已存在',
    formCommandRequired: '请输入执行命令',
    formUrlRequired: '请输入服务地址',
    loadFailed: '获取配置列表失败',
    loadStatusFailed: '获取状态失败',
    saveFailed: '保存失败',
    deleteFailed: '删除失败',
    connectedTo: '已连接到 {{name}}',
    connectFailed: '连接失败',
    disconnectFailed: '断开连接失败',
    testFoundTools_one: '连接测试成功，找到 {{count}} 个工具',
    testFoundTools_other: '连接测试成功，找到 {{count}} 个工具',
    testFailed: '连接测试失败'
  },
  knowledgeMcp: {
    title: '知识库 MCP',
    stopped: 'MCP 服务已停止',
    stopFailed: '停止服务失败',
    started: 'MCP 服务已启动',
    startFailedPrefix: '启动服务失败: ',
    unknownError: '未知错误',
    operationFailedPrefix: '操作失败: ',
    copied: '配置已复制到剪贴板',
    copyFailedPrefix: '复制失败: '
  },
  paperReader: {
    title: '论文阅读配置',
    apiKeyRequired: '请先填写 API Key',
    testSuccess: '连接测试成功，请点击保存配置以生效',
    testFailedFallback: '连接测试失败',
    testFailedPrefix: '测试失败: ',
    saveFailed: '保存失败',
    ocrSaved: 'OCR 配置已保存',
    translationSaved: '翻译模型配置已保存'
  },
  update: {
    checkFailed: '检查更新失败，请稍后重试',
    downloadFailed: '下载更新失败',
    releasesFailed: '获取版本历史失败'
  }
}

export default settings
