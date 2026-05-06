import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { AppConfig } from '@shared/types/config'
import { SkillService } from './SkillService.ts'
import { SkillToolService } from './SkillToolService.ts'

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
      directories: []
    }
  }
}

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'lumina-skill-test-'))
}

function getToolText(content: unknown): string {
  if (Array.isArray(content) && typeof content[0]?.text === 'string') {
    return content[0].text
  }
  return typeof content === 'string' ? content : ''
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
    assert.deepEqual(service.listAvailableSkills(), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SkillService 不暴露已停用的 Skill', () => {
  const root = createTempRoot()
  try {
    const skillDir = createSkillDir(root, 'paper', createManifest('paper.skill', 'prototype'))
    const config = createBaseConfig()
    config.skills!.directories = [
      { path: skillDir, enabled: false, addedAt: '2026-01-01T00:00:00.000Z' }
    ]

    const service = createService(config)
    service.reload()

    assert.equal(service.hasAvailableSkills(), false)
    assert.deepEqual(service.listAvailableSkills(), [])

    const readResult = service.readSkillInstructions('paper.skill')
    assert.equal(readResult.success, false)
    assert.match(readResult.error ?? '', /未找到可用 Skill/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SkillToolService 先列出摘要，再按需读取完整说明书', () => {
  const root = createTempRoot()
  try {
    const instructions = '完整说明书：先核对论文证据，再给出结论。'
    const paper = createSkillDir(
      root,
      'paper',
      createManifest('paper.skill', 'prototype', {
        activation: {
          keywords: ['prototype'],
          sessionTypes: ['paper']
        }
      }),
      instructions
    )
    const config = createBaseConfig()
    config.skills!.directories = [
      { path: paper, enabled: true, addedAt: '2026-01-01T00:00:00.000Z' }
    ]

    const service = createService(config)
    service.reload()
    const toolService = new SkillToolService(service)

    const listResult = toolService.callTool('skill__list', { query: 'paper' })
    const listText = getToolText(listResult.content)

    assert.equal(listResult.success, true)
    assert.match(listText, /paper\.skill/)
    assert.match(listText, /prototype/)
    assert.doesNotMatch(listText, /先核对论文证据/)

    const readResult = toolService.callTool('skill__read', { skillId: 'paper.skill' })
    const readText = getToolText(readResult.content)

    assert.equal(readResult.success, true)
    assert.match(readText, /paper\.skill/)
    assert.match(readText, /完整说明书/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
