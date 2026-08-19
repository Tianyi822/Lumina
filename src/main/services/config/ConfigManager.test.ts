import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

test('migrateConfig 删除 lab 残留数据并标记迁移', async () => {
  // 测试通过 tsAliasLoader 运行，electron 的 app.getPath('home') 已被 mock
  // 指向 tmpdir()/lumina-test，因此 getConfigDirPath() 返回的临时路径可安全操作
  const { getConfigDirPath } = await import('./configPaths.ts')
  const configDir = getConfigDirPath()

  // 清理并重建临时 config 目录
  rmSync(configDir, { recursive: true, force: true })
  mkdirSync(configDir, { recursive: true })

  // 模拟老用户残留：ssh-connections.json、ssh-keys/、lab/
  writeFileSync(join(configDir, 'ssh-connections.json'), '[]')
  mkdirSync(join(configDir, 'ssh-keys'), { recursive: true })
  writeFileSync(join(configDir, 'ssh-keys', 'old_key'), 'PRIVATE KEY DATA')
  mkdirSync(join(configDir, 'lab'), { recursive: true })
  mkdirSync(join(configDir, 'lab', 'lab-1'), { recursive: true })
  writeFileSync(join(configDir, 'lab', 'lab-1', 'metadata.json'), '{}')

  try {
    const legacyConfig = {
      theme: { name: 'lumina-dark', mode: 'manual' },
      llm_config: {
        default_model: '',
        compression_threshold: 0,
        enable_auto_compression: false,
        models: []
      },
      mcpServers: {}
    } as AppConfig

    const migrated = migrateConfig(legacyConfig)

    // 断言残留文件已删除
    assert.equal(existsSync(join(configDir, 'ssh-connections.json')), false)
    assert.equal(existsSync(join(configDir, 'ssh-keys')), false)
    assert.equal(existsSync(join(configDir, 'lab')), false)

    // 断言迁移标记已写入
    assert.equal(migrated.labRemovalMigrated, true)
  } finally {
    rmSync(configDir, { recursive: true, force: true })
  }
})

test('migrateConfig 在 labRemovalMigrated 已设置时不再执行清理（幂等）', async () => {
  const { getConfigDirPath } = await import('./configPaths.ts')
  const configDir = getConfigDirPath()

  rmSync(configDir, { recursive: true, force: true })
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'ssh-connections.json'), '[]')
  mkdirSync(join(configDir, 'lab'), { recursive: true })

  try {
    const alreadyMigratedConfig = {
      theme: { name: 'lumina-dark', mode: 'manual' },
      llm_config: {
        default_model: '',
        compression_threshold: 0,
        enable_auto_compression: false,
        models: []
      },
      mcpServers: {},
      labRemovalMigrated: true
    } as AppConfig

    migrateConfig(alreadyMigratedConfig)

    // 幂等：迁移标记已设置时残留文件应保留
    assert.equal(existsSync(join(configDir, 'ssh-connections.json')), true)
    assert.equal(existsSync(join(configDir, 'lab')), true)
  } finally {
    rmSync(configDir, { recursive: true, force: true })
  }
})
