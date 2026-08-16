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
    },
    display: {
      title: 'Display',
      description:
        'Choose your interface language and appearance. Changes apply instantly and sync with the native UI.',
      language: {
        title: 'Language',
        description: 'Choose the interface language. The switch takes effect immediately.'
      },
      theme: {
        followSystem: 'Follow System Theme',
        followSystemAuto: 'Your system is in {{mode}} mode and the app follows it automatically.',
        followSystemManual: 'Your system is in {{mode}} mode. You can pick a theme manually.',
        systemDark: 'dark',
        systemLight: 'light',
        available: 'Available Themes',
        availableDescAuto:
          'Following the system theme. Cards preview the current mapping; turn off auto mode to pick manually.',
        availableDescManual:
          'Pick a theme as the global appearance. All interface elements adapt automatically.',
        currentChip: 'Current: {{name}}',
        applyTheme: 'Apply theme {{name}}',
        descDark: 'Baseline dark theme unifying the dark, flat, controlled interaction style',
        descLight: 'A fresh, bright light theme'
      }
    },
    model: {
      title: 'Chat Models',
      description:
        'Manage chat models and the default model. Changes sync to local config automatically.',
      listTitle: 'Model List',
      defaultChip: 'Default: {{name}}',
      noDefault: 'Not set',
      nthModel: 'Model {{index}}',
      unnamed: 'Unnamed model',
      defaultBadge: 'Default',
      setDefault: 'Set as Default',
      modelNameLabel: 'Model Name',
      empty: 'No models configured',
      newFormTitle: 'Add New Model',
      addModel: 'Add Model',
      apiKeyShow: 'Show API Key',
      apiKeyHide: 'Hide API Key'
    }
  }
}

export default en
