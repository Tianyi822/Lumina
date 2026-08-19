const paper = {
  sidebar: {
    statusIdle: '待开始',
    statusQueued: 'OCR 排队中',
    statusProcessing: '处理中',
    statusCompleted: '已完成',
    statusPartialFailed: '部分失败',
    statusFailed: '失败',
    statusCancelled: '已取消',
    retryTitleScreenshot: '截图阶段失败',
    retryTitlePartial: 'OCR 部分失败',
    retryTitleOcr: 'OCR 阶段失败',
    renderFailedHint: '页图生成失败，请手动重试。',
    hasFailedPagesHint: '有页面识别失败，点击重试后会重新执行 OCR。',
    ocrFailedHint: 'OCR 执行失败，请手动重试。',
    unreadableFailed: '处理失败，暂不可阅读',
    unreadableIncomplete: '识别未完成，暂不可阅读',
    unreadableProcessing: '处理中，暂不可阅读',
    pagesCount_one: '{{count}} 页',
    pagesCount_other: '{{count}} 页',
    hasTranslation: '有译文',
    deleteTranslation: '删除翻译',
    deleteTranslationTooltip: '点击删除翻译内容',
    screenshotProgress: '截图进度',
    ocrProgress: 'OCR 进度',
    retry: '重试',
    deletePaperTooltip: '删除论文'
  },
  reader: {
    searchPlaceholder: '搜索...',
    searchNoResult: '无结果',
    prevMatch: '上一个 (Shift+Enter)',
    nextMatch: '下一个 (Enter)',
    closeSearch: '关闭 (Esc)',
    loadingContent: '正在加载内容...',
    emptyContent: '暂无内容',
    parseErrorPrefix: 'Markdown 解析失败: '
  },
  pdf: {
    loadFailed: '加载 PDF 原件失败',
    noPaperSelected: '未选择论文',
    pageAria: '第 {{index}} 页 PDF 原件',
    renderFailed: '页面渲染失败',
    loading: '正在加载 PDF 原件...'
  },
  segmentList: {
    retranslate: '重新翻译',
    retranslateHint: '该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。',
    translating: '正在翻译...',
    confirmTitle: '重新翻译',
    confirmMessage: '该段落存在批注或笔记。继续重新翻译后，这些标注会一起删除。',
    continueButton: '继续翻译'
  },
  figures: {
    resizeN: '从上边缩放图片预览',
    resizeE: '从右边缩放图片预览',
    resizeS: '从下边缩放图片预览',
    resizeW: '从左边缩放图片预览',
    resizeNE: '从右上角缩放图片预览',
    resizeNW: '从左上角缩放图片预览',
    resizeSE: '从右下角缩放图片预览',
    resizeSW: '从左下角缩放图片预览',
    previewAria: '论文图片预览',
    panelTitle: '论文图片预览',
    unpin: '取消钉住',
    pin: '钉住预览窗',
    closeAria: '关闭图片预览',
    prev: '上一张',
    prevAria: '查看上一张图片',
    next: '下一张',
    nextAria: '查看下一张图片'
  },
  annotation: {
    menu: {
      addNote: '记录笔记',
      addToChat: '添加到对话'
    },
    noteEditor: {
      titleEdit: '编辑笔记',
      titleCreate: '记录笔记',
      closeAria: '关闭笔记编辑器',
      placeholder: '写下这段内容的笔记...',
      delete: '删除笔记',
      updateSaving: '更新中...',
      update: '更新笔记',
      createSaving: '保存中...',
      create: '保存笔记',
      syncNotice: '该笔记只显示在当前译文中；如果之后删除译文，对应标注也会一起删除。'
    },
    popover: {
      deleteHighlight: '删除标记',
      deleteNote: '删除笔记',
      addNote: '添加笔记',
      editNote: '编辑笔记'
    }
  },
  chat: {
    panelTitle: '论文对话',
    scrollToBottomAria: '滚动到底部',
    emptyGreeting: '开始针对这篇论文提问吧',
    sessionTitle: '论文对话：{{name}}',
    taskLabel: '任务 {{index}}',
    phaseLabel: '阶段 {{number}}',
    iterationPhase: '第 {{number}} 阶段',
    quoteOriginal: '原文引用',
    quoteTranslation: '译文引用',
    context: '上下文',
    input: {
      replyPlaceholder: '选择一个回复',
      custom: '自定义',
      suggestCapabilities: '建议开启能力',
      ignore: '忽略',
      enableCapability: '开启 {{name}}',
      selectOption: '我选择：{{value}}',
      attachment: '附件',
      customPlaceholder: '输入自定义回答，或点击上方快捷选项 ...',
      askPlaceholder: '尽管问',
      dropToAttach: '释放以添加附件',
      addAttachmentOrTool: '添加附件或配置工具',
      addAttachment: '添加附件',
      search: '搜索',
      knowledgeBases: '知识库',
      send: '发送',
      stop: '停止'
    },
    modelSelector: {
      select: '选择模型',
      empty: '暂无模型配置'
    },
    kb: {
      documentCount_one: '{{count}} 个文档',
      documentCount_other: '{{count}} 个文档',
      selected_one: '已选 {{count}} 个知识库',
      selected_other: '已选 {{count}} 个知识库',
      compactLabel: '知识',
      label: '知识库',
      panelTitle: '知识库选择（多选）',
      availableCount_one: '{{count}} 个知识库可用',
      availableCount_other: '{{count}} 个知识库可用',
      searchPlaceholder: '搜索知识库...',
      searchAria: '搜索知识库',
      selectAll: '全选',
      deselectAll: '取消全选',
      empty: '暂无知识库，请在知识库管理页面创建',
      noMatch: '未找到匹配的知识库',
      collapse: '收起',
      expand: '展开'
    },
    mcp: {
      selected_one: '已选 {{count}} 个工具',
      selected_other: '已选 {{count}} 个工具',
      compactLabel: 'MCP',
      label: 'MCP 工具',
      panelTitle: 'MCP 工具（多选）',
      connectedServers_one: '{{count}} 个服务器已连接',
      connectedServers_other: '{{count}} 个服务器已连接',
      searchPlaceholder: '搜索工具...',
      searchAria: '搜索 MCP 工具',
      noMatch: '未找到匹配的工具',
      empty: '暂无可用工具，请在设置中配置 MCP 服务器',
      selectAll: '全选',
      deselectAll: '取消全选',
      collapse: '收起',
      expand: '展开'
    },
    plan: {
      statusPlanning: '规划中',
      statusPlanned: '已规划',
      statusRunning: '执行中',
      statusCompleted: '已完成',
      statusFailed: '失败',
      statusCancelled: '已取消',
      statusIdle: '待命',
      stepRunning: '运行',
      stepSuccess: '完成',
      stepFailed: '失败',
      stepCancelled: '取消',
      stepSkipped: '跳过',
      stepWaiting: '等待',
      iterationCallingTools: '调用工具',
      iterationProcessing: '处理结果',
      iterationComplete: '完成',
      iterationThinking: '思考',
      summaryWaiting: '等待模型生成执行计划',
      stepCount_one: '{{count}} 个步骤',
      stepCount_other: '{{count}} 个步骤',
      planningIndicator: '正在拆解任务'
    },
    interaction: {
      later: '稍后',
      expandMore_one: '展开更多（共 {{count}} 个）',
      expandMore_other: '展开更多（共 {{count}} 个）'
    },
    react: {
      toolCalls_one: '{{count}} 次工具调用',
      toolCalls_other: '{{count}} 次工具调用',
      inProgress: '进行中',
      phaseThinking: '阶段思考',
      title: '分阶段推理'
    },
    toolCall: {
      statusRunning: '执行中',
      statusSuccess: '完成',
      statusError: '失败',
      statusWaiting: '等待',
      params: '参数',
      result: '结果'
    },
    streaming: {
      organizing: '正在组织回答',
      readingContext: '模型正在读取论文上下文'
    },
    reasoning: {
      tokens: '约 {{formatted}}',
      title: '思考过程'
    },
    tokens: {
      summary: '总计: {{total}} | 缓存输入: {{cached}} ({{rate}})'
    },
    message: {
      inputTokens: '输入: 约 {{formatted}}'
    }
  }
}

export default paper
