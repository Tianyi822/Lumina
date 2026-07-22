import test from 'node:test'
import assert from 'node:assert/strict'

import { migrateConfig } from './ConfigManager.ts'
import type { AppConfig } from '@shared/types/config'

// 构造仅含必填字段的最小合法 AppConfig,便于在用例中扩展
function makeBaseConfig(): AppConfig {
  return {
    theme: { name: 'default', mode: 'manual' },
    llm_config: {
      default_model: 'default',
      compression_threshold: 0,
      enable_auto_compression: false,
      models: []
    },
    mcpServers: {}
  }
}

test('migrateConfig 保留已存在的 agent 字段(spec §3.3)', () => {
  const agentOverrides = { budget: { maxIterations: 10 }, legacy: { useLegacyCall: true } }
  const input = { ...makeBaseConfig(), agent: agentOverrides }

  const migrated = migrateConfig(input)

  // agent 不应被迁移逻辑删除/重写(迁移采用 spread + 黑名单删除,agent 不在删除名单)
  assert.equal('agent' in migrated, true)
  assert.deepEqual(migrated.agent, agentOverrides)
})

test('migrateConfig 无 agent 字段时不报错(返回 undefined)', () => {
  const migrated = migrateConfig(makeBaseConfig())

  // agent 可选,未配置时为 undefined,resolveHarnessConfig 会回退到默认
  assert.equal(migrated.agent, undefined)
})

test('migrateConfig 不会重写 agent 为空对象(保留 undefined 语义)', () => {
  // 这是与 embeddingModels(被强制初始化为 {})的关键差异:
  // agent 必须保持 undefined,否则 resolveHarnessConfig 会拿到空对象覆盖,
  // 把 DEFAULT_HARNESS_CONFIG 的字段全部抹掉
  const migrated = migrateConfig(makeBaseConfig())

  assert.equal(migrated.agent, undefined)
  assert.notDeepEqual(migrated.agent, {})
})
