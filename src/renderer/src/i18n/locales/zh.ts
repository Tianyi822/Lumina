/** 中文语言资源（基准）：新增 key 先加在这里，en.ts 结构与之同构 */
const zh = {
  common: {
    close: '关闭',
    cancel: '取消',
    add: '添加',
    delete: '删除',
    edit: '编辑',
    save: '保存',
    test: '测试',
    testing: '测试中...',
    testConnection: '测试连接',
    saveConfig: '保存配置',
    saving: '保存中...',
    loading: '加载中...',
    expand: '展开',
    collapse: '收起',
    refresh: '刷新',
    refreshing: '刷新中...',
    copy: '复制',
    copying: '复制中...',
    connect: '连接',
    connecting: '连接中...',
    disconnect: '断开'
  },
  settings: {
    title: '设置中心',
    loadingConfig: '正在加载当前配置...',
    nav: {
      paper: '论文阅读配置',
      knowledge: '知识库配置',
      advanced: '高级功能',
      display: '显示设置',
      sync: '数据同步',
      update: '升级版本'
    }
  }
}

/** 资源结构类型：en.ts 以此约束，编译期保证 key 对齐 */
export type Resources = typeof zh

export default zh
