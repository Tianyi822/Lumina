const knowledge = {
  common: {
    poolLabel: '文件资源池',
    noMatchingFiles: '未找到匹配的文件',
    searchPlaceholder: '搜索文件...'
  },
  main: {
    descriptionPlaceholder: '补充知识库用途、范围和检索约束...',
    descriptionEmptyHint: '双击编辑，补充知识库用途、覆盖范围和检索约束。',
    reindexNeededTitle: '需要重新索引',
    reindexNeededBody: '论文笔记已更新，重新索引后检索结果会使用最新笔记内容。',
    emptyTitle: '选择或创建知识库',
    emptyBody: '从左侧选择一个知识库，开始管理文档、索引和检索实验。'
  },
  form: {
    title: '创建知识库',
    nameLabel: '知识库名称 *',
    namePlaceholder: '例如：产品文档、技术规范...',
    descriptionLabel: '描述（可选）',
    descriptionPlaceholder: '简要描述这个知识库的用途...',
    modelLabel: '嵌入模型 *',
    modelEmpty: '暂无可用模型，请先在设置中配置嵌入模型',
    modelDimensions: '{{dimensions}} 维',
    modelHint: '嵌入模型用于将文本转换为向量，支持语义搜索。创建后不可更改。',
    chunkLabel: '分块策略',
    presetFineName: '精细检索',
    presetFineDesc: '适合代码、法律条文，精确匹配',
    presetBalancedName: '平衡模式',
    presetBalancedDesc: '通用场景，推荐',
    presetLongName: '长上下文',
    presetLongDesc: '适合论文、小说，保持段落完整',
    customName: '自定义',
    customDesc: '手动设置分块参数',
    chunkSize: '块大小',
    overlapSize: '重叠大小',
    chunkHint: '文本分块策略影响检索精度，创建后不可更改。',
    submit: '创建'
  },
  stats: {
    embeddingModel: '嵌入模型',
    vectorDimensions: '向量维度',
    chunkSize: '分块大小',
    indexedFiles: '已索引文件',
    docChunks: '文档块',
    dbSize: '数据库大小'
  },
  search: {
    title: '搜索测试',
    hint: '验证当前知识库的召回质量与片段命中情况。',
    placeholder: '输入测试查询...',
    submit: '搜索',
    resultsTitle: '结果',
    resultsCount_one: '{{count}} 条',
    resultsCount_other: '{{count}} 条',
    empty: '未找到相关结果',
    chunkPosition: '块 {{index}} / {{total}}'
  },
  fileList: {
    title: '关联文档',
    count_one: '{{count}} 个文件',
    count_other: '{{count}} 个文件',
    reindex: '重新索引',
    reindexing: '索引中...',
    addDocument: '添加文档',
    dropTitle: '释放文件以上传并挂载',
    dropHint: '支持 TXT、Markdown、PDF、Word 和 CSV。',
    loading: '正在加载文档...',
    emptyTitle: '当前知识库还没有挂载文档',
    emptyHint: '从文件资源池中选择已有文档，或直接拖拽文件到这里上传。',
    emptyAction: '添加第一份文档',
    unlinkTitle: '取消关联',
    indexSyncing: '索引同步中',
    addMore: '添加更多文档或拖拽上传'
  },
  fileManager: {
    title: '文件管理',
    fileCount_one: '{{count}} 个文件',
    fileCount_other: '{{count}} 个文件',
    emptyPool: '暂无文件，请上传文件',
    confirmDeleteTitle: '确认删除文件',
    confirmDeleteSubtitle: '此操作会同时影响已关联的知识库。',
    deleteUsage_one:
      '文件 "<strong>{{name}}</strong>" 正在被 <strong>{{count}}</strong> 个知识库使用。',
    deleteUsage_other:
      '文件 "<strong>{{name}}</strong>" 正在被 <strong>{{count}}</strong> 个知识库使用。',
    confirmDeleteWarning: '删除此文件将从所有关联的知识库中移除。此操作不可撤销。',
    forceDelete: '强制删除',
    usageBadge: '使用中',
    deleteTitleUsed: '文件被知识库使用，删除需谨慎',
    deleteTitle: '删除文件'
  },
  fileSelector: {
    title: '添加文件',
    availableCount_one: '{{count}} 个可挂载文件',
    availableCount_other: '{{count}} 个可挂载文件',
    emptyAvailable: '没有可添加的文件，请在上方拖放或选择文件上传',
    selectedCount_one: '已选择 {{count}} 个文件',
    selectedCount_other: '已选择 {{count}} 个文件',
    selectAll: '全选',
    deselectAll: '取消全选',
    addToKnowledge: '添加到知识库'
  },
  upload: {
    dropHintActive: '拖放文件到此处上传，或点击选择文件',
    dropHint: '拖放文件到这里，或点击选择文件',
    autoValidate: '系统会自动校验格式与大小。',
    supportedTypes: '支持 {{types}}，最大 50MB',
    uploading: '正在上传...'
  },
  preview: {
    openExternal: '外部打开',
    loading: '正在加载文件内容...',
    errorTitle: '文件预览失败',
    truncated: '文件内容较长，已截断显示。如需查看完整内容，请点击"外部打开"使用系统程序查看。',
    openFailed: '打开文件失败'
  },
  fileSource: {
    paper: '论文',
    paperNote: '论文笔记',
    uploadedFile: '上传文件',
    paperWithName: '论文：{{name}}'
  }
}

export default knowledge
