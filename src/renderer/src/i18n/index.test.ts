import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  i18n,
  initI18n,
  changeAppLanguage,
  reconcileLanguageFromConfig,
  getDateLocale,
  LANGUAGE_STORAGE_KEY
} from './index'
import zh from '@shared/i18n/locales/zh'
import en from '@shared/i18n/locales/en'

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

/** 递归收集资源对象的全部叶子 key（点分路径） */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? collectKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )
}

/** 按点分路径取资源叶子值 */
function getValueAt(obj: Record<string, unknown>, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((node, part) => {
    if (node !== null && typeof node === 'object') {
      return (node as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

test('zh/en 资源 key 集合完全对齐', () => {
  const zhKeys = collectKeys(zh).sort()
  const enKeys = collectKeys(en).sort()
  assert.deepEqual(enKeys, zhKeys)
})

/** 间接引用（t(变量)）扫不到、但被 key-map 常量消费的 key，显式断言存在以防误删 */
const INDIRECT_KEY_WHITELIST = [
  // workspaceNavigation.ts 的 WORKSPACE_NAV_LABEL_KEYS / WORKSPACE_ADD_LABEL_KEYS
  'chrome.nav.read',
  'chrome.nav.knowledge',
  'chrome.nav.writer',
  'chrome.nav.addPaper',
  'chrome.nav.addKnowledge',
  'chrome.nav.addDocument',
  // SettingsModal.tsx 的 SETTINGS_CATEGORIES labelKey
  'settings.nav.paper',
  'settings.nav.knowledge',
  'settings.nav.advanced',
  'settings.nav.display',
  'settings.nav.sync',
  'settings.nav.update',
  // WriterSidebarSection.tsx 的 collectionItems labelKey
  'chrome.sidebar.favorite',
  'chrome.sidebar.recent',
  'chrome.sidebar.all'
]

test('渲染进程 t() 字面量引用的 key 均存在于 zh 资源', () => {
  const zhKeys = new Set(collectKeys(zh))
  for (const key of INDIRECT_KEY_WHITELIST) {
    assert.ok(zhKeys.has(key), `间接引用的 key 不存在于资源: ${key}`)
  }

  const rendererRoot = path.join(import.meta.dirname, '..')
  const literalCallPattern = /(?:i18n\.)?\bt\(\s*(['"])([^'"]+)\1/g
  const offenders: Array<{ file: string; key: string }> = []

  const files = fs.readdirSync(rendererRoot, {
    recursive: true,
    encoding: 'utf8'
  }) as string[]
  for (const file of files) {
    if (!/\.(ts|tsx)$/.test(file) || /\.test\.(ts|tsx|mjs)$/.test(file)) continue
    const lines = fs.readFileSync(path.join(rendererRoot, file), 'utf8').split('\n')
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
      for (const match of line.matchAll(literalCallPattern)) {
        const key = match[2]
        // i18next 复数惯例：t(base, { count }) 由资源中的 base_one/_other 解析，base 本身可不存在
        const hasPluralPair = zhKeys.has(`${key}_one`) && zhKeys.has(`${key}_other`)
        if (!zhKeys.has(key) && !hasPluralPair) {
          offenders.push({ file: `${file}:${index + 1}`, key })
        }
      }
    })
  }
  assert.deepEqual(offenders, [], `存在未定义的 i18n key 引用: ${JSON.stringify(offenders)}`)
})

test('含 count 的资源 key 均以 _one/_other 成对定义', () => {
  const zhKeys = collectKeys(zh)
  const keySet = new Set(zhKeys)
  const offenders: string[] = []
  for (const key of zhKeys) {
    const leaf = key.split('.').pop() ?? ''
    if (leaf.endsWith('_one')) {
      if (!keySet.has(`${key.slice(0, -4)}_other`)) offenders.push(`${key} 缺少 _other 配对`)
    } else if (leaf.endsWith('_other')) {
      if (!keySet.has(`${key.slice(0, -6)}_one`)) offenders.push(`${key} 缺少 _one 配对`)
    } else {
      const value = getValueAt(zh, key)
      if (typeof value === 'string' && /\{\{\s*count\s*\}\}/.test(value)) {
        offenders.push(`${key} 含 {{count}} 但未用 _one/_other 成对定义`)
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('; '))
})
