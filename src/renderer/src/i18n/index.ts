/**
 * 渲染进程国际化模块：i18next 实例、语言初始化/切换/配置对账。
 * 语言状态唯一来源是 i18next 实例（不经 zustand）；
 * 持久化双写 localStorage（启动同步读取防闪烁）与 config.json（参与多端同步）。
 * 未做显式选择时默认跟随系统语言（中文环境→中文，其余→English），显式选择后以选择为准。
 */
import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { AppLanguage } from '@shared/types/config'
import zh from './locales/zh'
import en from './locales/en'

export const LANGUAGE_STORAGE_KEY = 'lumina-language'

const DEFAULT_LANGUAGE: AppLanguage = 'zh'

/** 应用级 i18next 实例（use(initReactI18next) 后供 useTranslation 默认消费） */
export const i18n: I18nInstance = i18next.createInstance()

/** 探测系统语言：中文环境（zh-*，含繁体）→ 中文，其余 → English；无法探测时回退默认中文 */
function detectSystemLanguage(): AppLanguage {
  try {
    if (typeof navigator === 'undefined' || !navigator.language) return DEFAULT_LANGUAGE
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return DEFAULT_LANGUAGE
  }
}

function readStoredLanguage(): AppLanguage {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    // 有显式选择时以选择为准；无值/非法值视为未选择，跟随系统语言
    if (stored === 'zh' || stored === 'en') return stored
    return detectSystemLanguage()
  } catch {
    return DEFAULT_LANGUAGE
  }
}

function writeStoredLanguage(language: AppLanguage): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // localStorage 不可用时仅本次会话内存生效
  }
}

/** 渲染前同步初始化 i18next（资源随 bundle 内嵌，无异步加载，无语言闪烁） */
export function initI18n(): Promise<I18nInstance> {
  return i18n
    .use(initReactI18next)
    .init({
      resources: {
        zh: { translation: zh },
        en: { translation: en }
      },
      lng: readStoredLanguage(),
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: { escapeValue: false }
    })
    .then(() => i18n)
}

/** 切换语言：立即重渲染 + 写 localStorage + 镜像 config.json（镜像失败仅记日志） */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language)
  writeStoredLanguage(language)
  try {
    // config:update 为 Result 模式：逻辑失败返回 { success: false } 而非抛异常，两者都记日志
    const result = await window.api.config.updateConfig({ language })
    if (!result.success) {
      window.api.logger?.warn('[i18n] 语言配置镜像写入失败', { error: result.error })
    }
  } catch (error) {
    window.api.logger?.warn('[i18n] 语言配置镜像写入失败', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/** 启动后以 config.json 为权威源校正语言（多端同步的语言在此生效）；无效值保持现状 */
export async function reconcileLanguageFromConfig(): Promise<void> {
  try {
    const config = (await window.api.config.getConfig()) as { language?: unknown } | null
    const remote = config?.language
    if (remote !== 'zh' && remote !== 'en') return
    if (remote !== i18n.language) {
      await i18n.changeLanguage(remote)
      writeStoredLanguage(remote)
    }
  } catch {
    // 读取配置失败时保持本地语言
  }
}

/** 日期格式化使用的 locale 标识（随当前语言） */
export function getDateLocale(): string {
  return i18n.language === 'en' ? 'en-US' : 'zh-CN'
}
