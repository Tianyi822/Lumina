import { createInstance, type i18n as I18nInstance, type ParseKeys } from 'i18next'
import zh from '@shared/i18n/locales/zh'
import en from '@shared/i18n/locales/en'

type LanguageProvider = () => string

let instance: I18nInstance | null = null
let languageProvider: LanguageProvider = () => 'zh'

/** 注入语言读取器（app.ts 装配；避免与 configManager 循环 import）；未注入缺省中文 */
export function setLanguageProvider(provider: LanguageProvider): void {
  languageProvider = provider
}

function getInstance(): I18nInstance {
  if (!instance) {
    instance = createInstance()
    instance.init({
      resources: { zh: { translation: zh }, en: { translation: en } },
      lng: 'zh',
      fallbackLng: 'zh',
      // i18next 26 以 initAsync 取代旧版 initImmediate；false 表示同步初始化，t() 无需 await
      initAsync: false,
      interpolation: { escapeValue: false }
    })
  }
  return instance
}

/** 主进程翻译入口：每次调用即时读取当前语言，新错误即时跟随语言切换、旧错误不追溯 */
export function t(key: ParseKeys, options?: Record<string, unknown>): string {
  const translate = getInstance().t as (key: string, options?: Record<string, unknown>) => string
  return translate(key, { ...options, lng: languageProvider() })
}
