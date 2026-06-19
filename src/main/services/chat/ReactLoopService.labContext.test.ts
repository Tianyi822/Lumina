import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildComposerContext } from './ReactLoopService'

test('从 request 提取 labDiscipline 与 labId', () => {
  const ctx = buildComposerContext({
    activeLabDiscipline: 'computer',
    activeLabId: 'lab-1'
  })
  assert.equal(ctx.labDiscipline, 'computer')
  assert.equal(ctx.labId, 'lab-1')
})

test('缺失时默认 null', () => {
  const ctx = buildComposerContext({})
  assert.equal(ctx.labDiscipline, null)
  assert.equal(ctx.labId, null)
})

test('保留既有字段并透传 selectedKnowledgeBases/selectedTools/mcpService', () => {
  const kbs = [{ id: 'kb-1', name: 'KB1', documentCount: 0 }]
  const tools = [{ serverName: 'mock', toolName: 'lookup', description: 'd', inputSchema: {} }]
  const mcp = { name: 'mcp-svc' }
  const ctx = buildComposerContext(
    {
      paperId: 'paper-x',
      enableLabTools: true,
      enablePaperWebSearch: true,
      selectedTools: tools
    },
    kbs,
    mcp
  )
  assert.equal(ctx.paperId, 'paper-x')
  assert.equal(ctx.enableLabTools, true)
  assert.equal(ctx.enablePaperWebSearch, true)
  assert.equal(ctx.selectedKnowledgeBases, kbs)
  assert.equal(ctx.selectedTools, tools)
  assert.equal(ctx.mcpService, mcp)
})
