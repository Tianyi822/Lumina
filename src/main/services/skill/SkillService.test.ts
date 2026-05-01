import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { AppConfig } from '@shared/types/config'
import { SkillService } from './SkillService.ts'

function createBaseConfig(): AppConfig {
  return {
    theme: { name: 'lumina-dark', mode: 'manual' },
    llm_config: {
      default_model: '',
      compression_threshold: 0,
      enable_auto_compression: false,
      models: []
    },
    mcpServers: {},
    skills: {
      directories: [],
      autoMatchEnabled: true,
      maxAutoMatchedSkills: 3
    }
  }
}

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'lumina-skill-test-'))
}

function createSkillDir(
  root: string,
  dirname: string,
  manifest: Record<string, unknown>,
  instructions = '请按照这个外部 Skill 的说明工作。'
): string {
  const skillDir = join(root, dirname)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'skill.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  writeFileSync(join(skillDir, 'SKILL.md'), instructions, 'utf-8')
  return skillDir
}

function createManifest(
  id: string,
  keyword: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    name: id,
    description: `${id} description`,
    version: '1.0.0',
    activation: {
      keywords: [keyword]
    },
    ...extra
  }
}

function createService(config: AppConfig): SkillService {
  return new SkillService({
    getConfig: () => config,
    saveConfig: (nextConfig) => {
      Object.assign(config, nextConfig)
      return { success: true }
    }
  })
}

test('SkillService 校验缺失规范文件', () => {
  const root = createTempRoot()
  try {
    const service = createService(createBaseConfig())
    const result = service.validatePath(root)

    assert.equal(result.success, false)
    assert.match(result.errors?.join('\n') ?? '', /skill\.json/)
    assert.match(result.errors?.join('\n') ?? '', /SKILL\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SkillService 会拒绝重复 id', () => {
  const root = createTempRoot()
  try {
    const first = createSkillDir(root, 'first', createManifest('duplicate.skill', 'alpha'))
    const second = createSkillDir(root, 'second', createManifest('duplicate.skill', 'beta'))
    const config = createBaseConfig()
    config.skills!.directories = [
      { path: first, enabled: true, addedAt: '2026-01-01T00:00:00.000Z' },
      { path: second, enabled: true, addedAt: '2026-01-01T00:00:00.000Z' }
    ]

    const service = createService(config)
    const results = service.reload()

    assert.equal(results.length, 2)
    assert.equal(
      results.every((result) => !result.success),
      true
    )
    assert.match(results[0].error ?? '', /重复/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SkillService 不匹配已停用的 Skill', () => {
  const root = createTempRoot()
  try {
    const skillDir = createSkillDir(root, 'paper', createManifest('paper.skill', 'prototype'))
    const config = createBaseConfig()
    config.skills!.directories = [
      { path: skillDir, enabled: false, addedAt: '2026-01-01T00:00:00.000Z' }
    ]

    const service = createService(config)
    service.reload()

    const matches = service.matchSkills({
      sessionId: 'session-1',
      modelKey: 'model',
      sessionType: 'paper',
      messages: [{ role: 'user', content: 'explain prototype generation' }]
    })

    assert.equal(matches.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SkillService 自动匹配会按分数排序', () => {
  const root = createTempRoot()
  try {
    const general = createSkillDir(root, 'general', createManifest('general.skill', 'prototype'))
    const paper = createSkillDir(
      root,
      'paper',
      createManifest('paper.skill', 'prototype', {
        activation: {
          keywords: ['prototype'],
          sessionTypes: ['paper']
        }
      })
    )
    const config = createBaseConfig()
    config.skills!.directories = [
      { path: general, enabled: true, addedAt: '2026-01-01T00:00:00.000Z' },
      { path: paper, enabled: true, addedAt: '2026-01-01T00:00:00.000Z' }
    ]

    const service = createService(config)
    service.reload()

    const matches = service.matchSkills({
      sessionId: 'session-1',
      modelKey: 'model',
      sessionType: 'paper',
      messages: [{ role: 'user', content: 'explain prototype generation' }]
    })

    assert.equal(matches.length, 2)
    assert.equal(matches[0].skillId, 'paper.skill')
    assert.ok(matches[0].score > matches[1].score)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
