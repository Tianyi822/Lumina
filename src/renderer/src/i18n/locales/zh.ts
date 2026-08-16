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
    },
    display: {
      title: '显示设置',
      description: '选择界面语言与外观主题，设置即时生效并会同步系统原生 UI。',
      language: {
        title: '语言',
        description: '选择界面显示语言，切换后立即生效。'
      },
      theme: {
        followSystem: '跟随系统主题',
        followSystemAuto: '当前检测到系统为{{mode}}模式，应用会自动同步。',
        followSystemManual: '当前检测到系统为{{mode}}模式，你可以手动切换主题。',
        systemDark: '深色',
        systemLight: '浅色',
        available: '可用主题',
        availableDescAuto: '已启用跟随系统，主题卡片仅作当前映射预览。关闭自动切换后可手动选择。',
        availableDescManual: '选择一个主题作为全局外观，所有界面元素将自动适配。',
        currentChip: '当前主题: {{name}}',
        applyTheme: '应用主题 {{name}}',
        descDark: '深色基准主题，统一整个应用的深色、平面和受控交互基线',
        descLight: '浅色主题，清新明亮的界面风格'
      }
    }
  }
}

/** 资源结构类型：en.ts 以此约束，编译期保证 key 对齐 */
export type Resources = typeof zh

export default zh
