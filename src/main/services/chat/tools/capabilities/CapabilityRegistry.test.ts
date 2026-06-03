import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CapabilityRegistry } from './CapabilityRegistry'
import type { CapabilityUnit } from './CapabilityUnit'

function makeUnit(id: string, tags: string[] = []): CapabilityUnit {
  return {
    id,
    displayName: id,
    description: `${id} capability`,
    tags,
    createAdapter: () => null,
    describeTools: () => []
  } satisfies CapabilityUnit
}

describe('CapabilityRegistry', () => {
  it('注册和获取能力单元', () => {
    const registry = new CapabilityRegistry()
    const unit = makeUnit('paper', ['论文', 'OCR'])
    registry.register(unit)
    assert.equal(registry.get('paper'), unit)
    assert.equal(registry.get('unknown'), undefined)
  })

  it('getAll 返回所有已注册的能力', () => {
    const registry = new CapabilityRegistry()
    registry.register(makeUnit('paper'))
    registry.register(makeUnit('lab'))
    assert.equal(registry.getAll().length, 2)
  })

  it('findByTags 按标签匹配能力', () => {
    const registry = new CapabilityRegistry()
    registry.register(makeUnit('paper', ['论文', 'OCR']))
    registry.register(makeUnit('lab', ['代码执行', '容器']))
    registry.register(makeUnit('knowledge', ['知识库', '文档搜索']))

    const found = registry.findByTags(['代码'])
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 'lab')
  })

  it('findByTags 无匹配返回空数组', () => {
    const registry = new CapabilityRegistry()
    assert.deepEqual(registry.findByTags(['不存在']), [])
  })

  it('重复注册覆盖旧值', () => {
    const registry = new CapabilityRegistry()
    const v1 = makeUnit('paper', ['旧'])
    const v2 = makeUnit('paper', ['新'])
    registry.register(v1)
    registry.register(v2)
    assert.equal(registry.get('paper')!.tags[0], '新')
    assert.equal(registry.getAll().length, 1)
  })
})
