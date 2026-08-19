import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeConfig, collectMachineLocalKeys } from './configMerge'
import type { AppConfig } from '@shared/types/config'

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    theme: { name: 'lumina-dark' },
    llm_config: {
      default_model: 'm1',
      compression_threshold: 10,
      enable_auto_compression: false,
      models: [{ base_url: 'http://x', api_key: 'k', model_name: 'm1' }]
    },
    mcpServers: {},
    ...overrides
  } as AppConfig
}

test('collectMachineLocalKeys 收集 mcpServers 与 embeddingModels 的 key', () => {
  const config = makeConfig({
    mcpServers: {
      local: { name: 'local', transport: 'stdio', command: '/usr/bin/x' }
    } as AppConfig['mcpServers'],
    embeddingModels: {
      emb1: {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'nomic',
        dimensions: 768
      }
    }
  })
  const keys = collectMachineLocalKeys(config)
  assert.deepEqual([...keys.mcpServerNames], ['local'])
  assert.deepEqual([...keys.embeddingModelIds], ['emb1'])
})

test('远端更新且无机器相关冲突 → winner=remote', () => {
  const local = makeConfig({ theme: { name: 'lumina-dark' } })
  const remote = makeConfig({ theme: { name: 'lumina-light' } })
  const result = mergeConfig({
    local,
    localMtime: '2026-08-04T10:00:00.000Z',
    remote,
    remoteMtime: '2026-08-04T11:00:00.000Z',
    machineLocalKeys: { mcpServerNames: new Set(), embeddingModelIds: new Set() }
  })
  assert.equal(result.winner, 'remote')
  assert.equal(result.merged.theme.name, 'lumina-light')
  assert.equal(result.changed, true)
})

test('本地更新 → winner=local', () => {
  const local = makeConfig({ theme: { name: 'lumina-dark' } })
  const remote = makeConfig({ theme: { name: 'lumina-light' } })
  const result = mergeConfig({
    local,
    localMtime: '2026-08-04T12:00:00.000Z',
    remote,
    remoteMtime: '2026-08-04T11:00:00.000Z',
    machineLocalKeys: { mcpServerNames: new Set(), embeddingModelIds: new Set() }
  })
  assert.equal(result.winner, 'local')
  assert.equal(result.merged.theme.name, 'lumina-dark')
  assert.equal(result.changed, false)
})

test('mtime 相等 → 倾向 remote', () => {
  const local = makeConfig({ theme: { name: 'lumina-dark' } })
  const remote = makeConfig({ theme: { name: 'lumina-light' } })
  const result = mergeConfig({
    local,
    localMtime: '2026-08-04T10:00:00.000Z',
    remote,
    remoteMtime: '2026-08-04T10:00:00.000Z',
    machineLocalKeys: { mcpServerNames: new Set(), embeddingModelIds: new Set() }
  })
  assert.equal(result.winner, 'remote')
})

test('本机有同名 mcpServer，远端改 theme → winner=merged，本机 mcpServer 保留', () => {
  const local = makeConfig({
    theme: { name: 'lumina-dark' },
    mcpServers: {
      local: { name: 'local', transport: 'stdio', command: '/usr/local/bin/x' }
    } as AppConfig['mcpServers']
  })
  const remote = makeConfig({
    theme: { name: 'lumina-light' },
    mcpServers: {
      local: { name: 'local', transport: 'stdio', command: '/remote/path/x' },
      remote: { name: 'remote', transport: 'sse', url: 'http://remote' }
    } as AppConfig['mcpServers']
  })
  const result = mergeConfig({
    local,
    localMtime: '2026-08-04T10:00:00.000Z',
    remote,
    remoteMtime: '2026-08-04T11:00:00.000Z',
    machineLocalKeys: {
      mcpServerNames: new Set(['local']),
      embeddingModelIds: new Set()
    }
  })
  assert.equal(result.winner, 'merged')
  // theme 取远端
  assert.equal(result.merged.theme.name, 'lumina-light')
  // mcpServers.local 保留本机 command
  assert.equal(
    (result.merged.mcpServers as Record<string, { command?: string }>).local.command,
    '/usr/local/bin/x'
  )
  // mcpServers.remote 是远端新增，并入
  assert.ok((result.merged.mcpServers as Record<string, unknown>).remote)
  assert.equal(result.changed, true)
})

test('本机有同名 embeddingModel（localhost）→ merged，保留本机条目', () => {
  const local = makeConfig({
    embeddingModels: {
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'nomic', dimensions: 768 }
    }
  })
  const remote = makeConfig({
    theme: { name: 'lumina-light' },
    embeddingModels: {
      ollama: { baseUrl: 'http://192.168.1.5:11434', model: 'nomic', dimensions: 768 }
    }
  })
  const result = mergeConfig({
    local,
    localMtime: '2026-08-04T10:00:00.000Z',
    remote,
    remoteMtime: '2026-08-04T11:00:00.000Z',
    machineLocalKeys: {
      mcpServerNames: new Set(),
      embeddingModelIds: new Set(['ollama'])
    }
  })
  assert.equal(result.winner, 'merged')
  assert.equal(
    (result.merged.embeddingModels as Record<string, { baseUrl: string }>).ollama.baseUrl,
    'http://127.0.0.1:11434'
  )
})

test('机器相关条目全保留本机但其余字段无差异 → winner 仍按 mtime', () => {
  const local = makeConfig({
    theme: { name: 'lumina-dark' },
    mcpServers: {
      local: { name: 'local', transport: 'stdio', command: '/usr/bin/x' }
    } as AppConfig['mcpServers']
  })
  const remote = makeConfig({
    theme: { name: 'lumina-dark' },
    mcpServers: {
      local: { name: 'local', transport: 'stdio', command: '/usr/bin/x' }
    } as AppConfig['mcpServers']
  })
  const result = mergeConfig({
    local,
    localMtime: '2026-08-04T12:00:00.000Z',
    remote,
    remoteMtime: '2026-08-04T11:00:00.000Z',
    machineLocalKeys: {
      mcpServerNames: new Set(['local']),
      embeddingModelIds: new Set()
    }
  })
  // mtime 本地更新且无差异 → local，changed=false
  assert.equal(result.winner, 'local')
  assert.equal(result.changed, false)
})
