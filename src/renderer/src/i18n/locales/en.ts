import type { Resources } from './zh'

/** 英文语言资源：结构必须与 zh.ts 完全一致（编译期类型约束） */
const en: Resources = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    add: 'Add',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    test: 'Test',
    testing: 'Testing...',
    testConnection: 'Test Connection',
    saveConfig: 'Save',
    saving: 'Saving...',
    loading: 'Loading...',
    expand: 'Expand',
    collapse: 'Collapse',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    copy: 'Copy',
    copying: 'Copying...',
    connect: 'Connect',
    connecting: 'Connecting...',
    disconnect: 'Disconnect'
  },
  settings: {
    title: 'Settings',
    loadingConfig: 'Loading current configuration...',
    nav: {
      paper: 'Paper Reader',
      knowledge: 'Knowledge Base',
      advanced: 'Advanced',
      display: 'Display',
      sync: 'Data Sync',
      update: 'Updates'
    }
  }
}

export default en
