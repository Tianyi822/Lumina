import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PaperCapability } from './PaperCapability'
import { KnowledgeCapability } from './KnowledgeCapability'
import { LabCapability } from './LabCapability'
import { PaperWebCapability } from './PaperWebCapability'
import { McpCapability } from './McpCapability'
import type { CapabilityUnit } from './CapabilityUnit'

describe('PaperCapability', () => {
  const cap = new PaperCapability()

  it('元数据正确', () => {
    assert.equal(cap.id, 'paper')
    assert.equal(cap.displayName, '论文检索')
    assert.ok(cap.tags.length > 0)
    assert.ok(cap.tags.includes('论文'))
  })

  it('无 paperId 时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({}), null)
    assert.equal(cap.createAdapter({ paperId: undefined }), null)
  })

  it('有 paperId 时 createAdapter 返回非 null', () => {
    const adapter = cap.createAdapter({ paperId: 'test-paper-id' })
    assert.notEqual(adapter, null)
  })

  it('describeTools 返回 paper 搜索工具', () => {
    const tools = cap.describeTools()
    assert.ok(tools.length > 0)
    assert.ok(tools.some((t) => t.name.includes('paper')))
  })

  it('enrichResult 方法存在且可调用', () => {
    assert.equal(typeof cap.enrichResult, 'function')
  })
})

describe('KnowledgeCapability', () => {
  const cap = new KnowledgeCapability()

  it('元数据正确', () => {
    assert.equal(cap.id, 'knowledge')
    assert.equal(cap.displayName, '知识库搜索')
    assert.ok(cap.tags.includes('知识库'))
  })

  it('无 paperId 且无知识库时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({}), null)
  })

  it('仅有 paperId、未选择知识库时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({ paperId: 'test-paper-id' }), null)
  })

  it('有 selectedKnowledgeBases 时 createAdapter 返回非 null', () => {
    const adapter = cap.createAdapter({
      selectedKnowledgeBases: [{ id: 'kb1', name: 'test', documentCount: 0 }]
    })
    assert.notEqual(adapter, null)
  })

  it('describeTools 返回知识库工具列表', () => {
    const tools = cap.describeTools({})
    assert.ok(tools.length >= 2)
    assert.ok(tools.some((t) => t.name.includes('knowledge')))
  })

  it('describeTools 反映知识库数量', () => {
    const withKbTools = cap.describeTools({
      selectedKnowledgeBases: [
        { id: 'kb1', documentCount: 1 },
        { id: 'kb2', documentCount: 2 }
      ]
    })
    assert.ok(withKbTools.length > 0)
  })
})

describe('LabCapability', () => {
  const cap = new LabCapability()

  it('元数据正确', () => {
    assert.equal(cap.id, 'lab')
    assert.equal(cap.displayName, '实验室工具')
    assert.ok(cap.tags.includes('命令执行'))
  })

  it('createAdapter 始终返回非 null（无上下文依赖）', () => {
    const unit: CapabilityUnit = cap
    assert.notEqual(unit.createAdapter({}), null)
    assert.notEqual(unit.createAdapter(null), null)
    assert.notEqual(unit.createAdapter(undefined), null)
  })

  it('describeTools 返回 lab 工具', () => {
    const tools = cap.describeTools()
    assert.ok(tools.length > 0)
    assert.ok(tools.some((t) => t.name.includes('lab')))
  })
})

describe('PaperWebCapability', () => {
  const cap = new PaperWebCapability()

  it('元数据正确', () => {
    assert.equal(cap.id, 'paper_web')
    assert.equal(cap.displayName, '学术网页搜索')
    assert.ok(cap.tags.includes('联网搜索'))
  })

  it('无 paperId 时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({ enablePaperWebSearch: true }), null)
  })

  it('无 enablePaperWebSearch 时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({ paperId: 'test-paper-id' }), null)
  })

  it('describeTools 返回学术搜索工具', () => {
    const tools = cap.describeTools()
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'paper_web__search')
  })
})

describe('McpCapability', () => {
  const cap = new McpCapability()

  it('元数据正确', () => {
    assert.equal(cap.id, 'mcp')
    assert.equal(cap.displayName, 'MCP 外部工具')
    assert.ok(cap.tags.includes('MCP'))
  })

  it('无 mcpService 时 createAdapter 返回 null', () => {
    assert.equal(
      cap.createAdapter({
        selectedTools: [{ serverName: 's', toolName: 't', description: 'd', inputSchema: {} }]
      }),
      null
    )
  })

  it('无 selectedTools 时 createAdapter 返回 null', () => {
    assert.equal(cap.createAdapter({ mcpService: {} as never }), null)
    assert.equal(cap.createAdapter({ mcpService: {} as never, selectedTools: [] }), null)
  })

  it('describeTools 无工具时返回空数组', () => {
    const tools = cap.describeTools({})
    assert.deepEqual(tools, [])
  })

  it('describeTools 将工具映射为 serverName__toolName', () => {
    const tools = cap.describeTools({
      selectedTools: [
        { serverName: 'arxiv', toolName: 'search', description: 'search arxiv', inputSchema: {} },
        { serverName: 'github', toolName: 'list_repos', description: 'list repos', inputSchema: {} }
      ]
    })
    assert.equal(tools.length, 2)
    assert.equal(tools[0].name, 'arxiv__search')
    assert.equal(tools[1].name, 'github__list_repos')
  })
})
