import assert from 'node:assert/strict'
import test from 'node:test'

import {
  i18n,
  initI18n,
  changeAppLanguage,
  reconcileLanguageFromConfig,
  getDateLocale,
  normalizeLanguage,
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
  updateConfigCalls: Array<{ language?: unknown }>
  updateConfigError?: Error
}

function installGlobals(options: Partial<WindowStub> = {}): WindowStub {
  const stub: WindowStub = {
    stored: options.stored ?? createLocalStorageStub(),
    config: options.config ?? null,
    updateConfigCalls: [],
    updateConfigError: options.updateConfigError
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: stub.stored })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        config: {
          getConfig: async () => stub.config,
          updateConfig: async (partial: { language?: unknown }) => {
            if (stub.updateConfigError) throw stub.updateConfigError
            stub.updateConfigCalls.push(partial)
            return { success: true }
          }
        },
        logger: {
          info: async () => ({ success: true }),
          warn: async () => ({ success: true }),
          error: async () => ({ success: true })
        }
      }
    }
  })
  return stub
}

test('initI18n：localStorage 无值时默认中文', async () => {
  installGlobals()
  await initI18n()
  assert.equal(i18n.language, 'zh')
  assert.equal(i18n.t('settings.nav.display'), '显示设置')
})

test('initI18n：读取 localStorage 中已存语言', async () => {
  const stored = createLocalStorageStub()
  stored.setItem(LANGUAGE_STORAGE_KEY, 'en')
  installGlobals({ stored })
  await initI18n()
  assert.equal(i18n.language, 'en')
  assert.equal(i18n.t('settings.nav.display'), 'Display')
})

test('initI18n：非法存储值归一化为中文', async () => {
  const stored = createLocalStorageStub()
  stored.setItem(LANGUAGE_STORAGE_KEY, 'fr')
  installGlobals({ stored })
  await initI18n()
  assert.equal(i18n.language, 'zh')
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

test('getDateLocale 随当前语言返回 locale 标识', async () => {
  installGlobals()
  await initI18n()
  assert.equal(getDateLocale(), 'zh-CN')
  await changeAppLanguage('en')
  assert.equal(getDateLocale(), 'en-US')
})

test('normalizeLanguage：仅接受 zh/en，其余回退 zh', () => {
  assert.equal(normalizeLanguage('zh'), 'zh')
  assert.equal(normalizeLanguage('en'), 'en')
  assert.equal(normalizeLanguage('fr'), 'zh')
  assert.equal(normalizeLanguage(undefined), 'zh')
  assert.equal(normalizeLanguage(42), 'zh')
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
