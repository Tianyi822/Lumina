import assert from 'node:assert/strict'
import test from 'node:test'

import {
  i18n,
  initI18n,
  changeAppLanguage,
  reconcileLanguageFromConfig,
  getDateLocale,
  LANGUAGE_STORAGE_KEY
} from './index'
import zh from './locales/zh'
import en from './locales/en'

/** 简易 localStorage 内存桩（node 环境无 localStorage 全局） */
function createLocalStorageStub(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    }
  } as Storage
}

interface WindowStub {
  stored: Storage
  config: { language?: unknown } | null
  navigatorLanguage: string
  updateConfigCalls: Array<{ language?: unknown }>
  updateConfigError?: Error
  updateConfigResult?: { success: boolean; error?: string }
  warnCalls: Array<{ message: string; context?: unknown }>
}

function installGlobals(options: Partial<WindowStub> = {}): WindowStub {
  const stub: WindowStub = {
    stored: options.stored ?? createLocalStorageStub(),
    config: options.config ?? null,
    navigatorLanguage: options.navigatorLanguage ?? 'zh-CN',
    updateConfigCalls: [],
    updateConfigError: options.updateConfigError,
    updateConfigResult: options.updateConfigResult,
    warnCalls: []
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: stub.stored })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: stub.navigatorLanguage }
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        config: {
          getConfig: async () => stub.config,
          updateConfig: async (partial: { language?: unknown }) => {
            if (stub.updateConfigError) throw stub.updateConfigError
            if (stub.updateConfigResult) return stub.updateConfigResult
            stub.updateConfigCalls.push(partial)
            return { success: true }
          }
        },
        logger: {
          info: async () => ({ success: true }),
          warn: async (message: string, context?: unknown) => {
            stub.warnCalls.push({ message, context })
            return { success: true }
          },
          error: async () => ({ success: true })
        }
      }
    }
  })
  return stub
}

test('initI18n：无显式选择时跟随系统语言（中文系统）', async () => {
  installGlobals({ navigatorLanguage: 'zh-CN' })
  await initI18n()
  assert.equal(i18n.language, 'zh')
  assert.equal(i18n.t('settings.nav.display'), '显示设置')
})

test('initI18n：英文系统回退 English', async () => {
  installGlobals({ navigatorLanguage: 'en-US' })
  await initI18n()
  assert.equal(i18n.language, 'en')
  assert.equal(i18n.t('settings.nav.display'), 'Display')
})

test('initI18n：其他语言系统回退 English', async () => {
  installGlobals({ navigatorLanguage: 'fr-FR' })
  await initI18n()
  assert.equal(i18n.language, 'en')
})

test('initI18n：繁体中文系统按中文处理', async () => {
  installGlobals({ navigatorLanguage: 'zh-TW' })
  await initI18n()
  assert.equal(i18n.language, 'zh')
})

test('initI18n：读取 localStorage 中已存语言', async () => {
  const stored = createLocalStorageStub()
  stored.setItem(LANGUAGE_STORAGE_KEY, 'en')
  installGlobals({ stored })
  await initI18n()
  assert.equal(i18n.language, 'en')
  assert.equal(i18n.t('settings.nav.display'), 'Display')
})

test('initI18n：显式选择优先于系统语言', async () => {
  const stored = createLocalStorageStub()
  stored.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  installGlobals({ stored, navigatorLanguage: 'en-US' })
  await initI18n()
  assert.equal(i18n.language, 'zh')
})

test('initI18n：非法存储值视为未选择并跟随系统', async () => {
  const stored = createLocalStorageStub()
  stored.setItem(LANGUAGE_STORAGE_KEY, 'fr')
  installGlobals({ stored, navigatorLanguage: 'zh-CN' })
  await initI18n()
  assert.equal(i18n.language, 'zh')

  installGlobals({ stored, navigatorLanguage: 'en-US' })
  await initI18n()
  assert.equal(i18n.language, 'en')
})

test('changeAppLanguage：切换语言并双写 localStorage 与 config.json', async () => {
  const stub = installGlobals()
  await initI18n()
  await changeAppLanguage('en')
  assert.equal(i18n.language, 'en')
  assert.equal(stub.stored.getItem(LANGUAGE_STORAGE_KEY), 'en')
  assert.deepEqual(stub.updateConfigCalls, [{ language: 'en' }])
})

test('changeAppLanguage：config 镜像写失败不抛错、本地切换仍生效', async () => {
  const stub = installGlobals({ updateConfigError: new Error('ipc down') })
  await initI18n()
  await changeAppLanguage('en')
  assert.equal(i18n.language, 'en')
  assert.equal(stub.stored.getItem(LANGUAGE_STORAGE_KEY), 'en')
})

test('changeAppLanguage：config 镜像返回逻辑失败时记日志、本地切换仍生效', async () => {
  const stub = installGlobals({ updateConfigResult: { success: false, error: 'no config loaded' } })
  await initI18n()
  await changeAppLanguage('en')
  assert.equal(i18n.language, 'en')
  assert.equal(stub.stored.getItem(LANGUAGE_STORAGE_KEY), 'en')
  assert.equal(stub.warnCalls.length, 1)
})

test('reconcileLanguageFromConfig：config 语言不同则以 config 为准切换', async () => {
  const stub = installGlobals({ config: { language: 'en' } })
  await initI18n()
  assert.equal(i18n.language, 'zh')
  await reconcileLanguageFromConfig()
  assert.equal(i18n.language, 'en')
  assert.equal(stub.stored.getItem(LANGUAGE_STORAGE_KEY), 'en')
})

test('reconcileLanguageFromConfig：相同/缺失/非法值均不改变当前语言', async () => {
  installGlobals({ config: { language: 'zh' } })
  await initI18n()
  await reconcileLanguageFromConfig()
  assert.equal(i18n.language, 'zh')

  installGlobals({ config: null })
  await reconcileLanguageFromConfig()
  assert.equal(i18n.language, 'zh')

  installGlobals({ config: { language: 'fr' } })
  await reconcileLanguageFromConfig()
  assert.equal(i18n.language, 'zh')
})

test('reconcileLanguageFromConfig：等待期间用户切换语言则放弃对账', async () => {
  const stub = installGlobals()
  await initI18n()
  // getConfig 改为手动闸门，保证用户切换先于 config 返回（ref 对象绕开 TS 对闭包赋值的窄化）
  const resolveConfigRef: { current: ((value: { language: string }) => void) | null } = {
    current: null
  }
  const windowApi = (globalThis as { window: { api: { config: { getConfig: unknown } } } }).window
  windowApi.api.config.getConfig = () =>
    new Promise<{ language: string }>((resolve) => {
      resolveConfigRef.current = resolve
    })

  const reconcilePromise = reconcileLanguageFromConfig()
  await changeAppLanguage('en')
  resolveConfigRef.current?.({ language: 'zh' })
  await reconcilePromise

  assert.equal(i18n.language, 'en')
  assert.equal(stub.stored.getItem(LANGUAGE_STORAGE_KEY), 'en')
})

test('getDateLocale 随当前语言返回 locale 标识', async () => {
  installGlobals()
  await initI18n()
  assert.equal(getDateLocale(), 'zh-CN')
  await changeAppLanguage('en')
  assert.equal(getDateLocale(), 'en-US')
})

test('zh/en 资源 key 集合完全对齐', () => {
  function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) =>
      value !== null && typeof value === 'object'
        ? collectKeys(value as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`]
    )
  }
  const zhKeys = collectKeys(zh).sort()
  const enKeys = collectKeys(en).sort()
  assert.deepEqual(enKeys, zhKeys)
})
