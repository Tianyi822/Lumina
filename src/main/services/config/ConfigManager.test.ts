import test from 'node:test'
import assert from 'node:assert/strict'

import { migrateConfig } from './ConfigManager.ts'
import type { AppConfig } from '@shared/types/config'

test('配置迁移会剥离旧 promptConfig 与 skills 配置，并保留 MCP 环境变量', () => {
  const legacyConfig = {
    theme: {
      name: 'lumina-dark',
      mode: 'manual'
    },
    llm_config: {
      default_model: 'default',
      compression_threshold: 0,
      enable_auto_compression: false,
      models: []
    },
    mcpServers: {
      paperTools: {
        name: 'paperTools',
        transport: 'stdio',
        command: 'paper-tools',
        env: {
          API_KEY: 'keep-this'
        }
      }
    },
    promptConfig: {
      customSystemPrompt: 'legacy prompt',
      customVariables: [{ name: 'context', description: 'legacy', type: 'custom' }],
      fewShotCount: 2,
      enableDynamicExamples: true,
      enablePromptCache: true,
      enablePromptOptimization: true
    },
    skills: {
      autoMatchEnabled: false,
      maxAutoMatchedSkills: 8,
      directories: []
    }
  } as AppConfig & { promptConfig: Record<string, unknown>; skills: Record<string, unknown> }

  const migrated = migrateConfig(legacyConfig)

  assert.equal('promptConfig' in migrated, false)
  assert.equal('skills' in migrated, false)
  assert.equal(migrated.mcpServers.paperTools.env?.API_KEY, 'keep-this')
  assert.equal(migrated.theme.mode, 'manual')
})
