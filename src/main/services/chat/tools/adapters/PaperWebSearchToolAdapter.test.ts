/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  PaperWebSearchEnvironmentInfo,
  PaperWebSearchOutput,
  PaperWebSearchToolInput
} from '@shared/types/paper-web-search'
import { PaperWebSearchToolAdapter } from '../../../paper-web-search/PaperWebSearchToolAdapter'

class MockPaperWebSearchService {
  environmentCache: PaperWebSearchEnvironmentInfo | null = null

  async checkEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
    return { available: true, runtime: 'electron', executable: 'electron.net.fetch' }
  }

  clearEnvironmentCache(): void {
    this.environmentCache = null
  }

  async search(input: PaperWebSearchToolInput): Promise<PaperWebSearchOutput> {
    void input
    return {
      success: true,
      query: 'test query',
      quality: 'high',
      results: [
        {
          title: 'Test Paper',
          url: 'https://example.com/paper',
          source: 'arXiv',
          publishedDate: '2024-01-01',
          summary: 'A test paper summary',
          snippet: 'This is a test snippet',
          relevanceScore: 0.95
        }
      ],
      totalDiscovered: 10,
      totalCrawled: 5,
      totalRetained: 1,
      elapsedMs: 1500
    }
  }
}

const paperContext = {
  paperId: 'test-123',
  fileName: 'test-paper.pdf',
  paperTitle: 'Test Paper Title',
  paperAuthors: ['Author A', 'Author B'],
  paperKeywords: ['AI', 'test'],
  selectedQuote: 'Important finding',
  selectedQuoteContext: 'Section 3.1',
  userQuestion: 'What are the main findings?',
  referenceHints: ['Smith et al. 2023']
}

describe('PaperWebSearchToolAdapter', () => {
  it('getTools 返回单个 paper_web__search 工具', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)
    const tools = await adapter.getTools()

    assert.equal(tools.length, 1)
    assert.equal(tools[0].serverName, 'paper_web')
    assert.equal(tools[0].toolName, 'search')
    assert.ok(tools[0].description.length > 0)
    const props = tools[0].inputSchema.properties as Record<string, unknown>
    assert.ok(props.query)
    assert.ok(props.reason)
    assert.deepEqual(tools[0].inputSchema.required, ['query', 'reason'])
  })

  it('execute 缺少 query 时返回失败', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)
    const result = await adapter.execute('search', { reason: 'test reason' })

    assert.equal(result.success, false)
    assert.ok(result.error?.includes('query'))
  })

  it('execute 缺少 reason 时返回失败', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)
    const result = await adapter.execute('search', { query: 'test query' })

    assert.equal(result.success, false)
    assert.ok(result.error?.includes('reason'))
  })

  it('execute 未设置 paperContext 时返回失败', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)
    const result = await adapter.execute('search', {
      query: 'test query',
      reason: 'test reason'
    })

    assert.equal(result.success, false)
    assert.ok(result.error?.includes('论文上下文'))
  })

  it('execute 成功时返回结构化搜索结果', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)

    adapter.setPaperContext(paperContext)
    const result = await adapter.execute('search', {
      query: 'test query',
      reason: 'test reason',
      target: 'paper',
      recency: 'recent'
    })

    assert.equal(result.success, true)
    assert.ok(result.content)
    const content = result.content as Record<string, unknown>
    assert.equal(content.query, 'test query')
    assert.equal(content.quality, 'high')
    assert.equal(content.resultCount, 1)
    assert.ok(typeof content.elapsedMs === 'number')
    assert.ok(Array.isArray(content.results))
    assert.equal((content.results as any[])[0].title, 'Test Paper')
  })

  it('execute 支持统一执行器传入的完整工具名', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)

    adapter.setPaperContext(paperContext)
    const result = await adapter.execute('paper_web__search', {
      query: 'Mamba state space model architecture',
      reason: '用户想了解 Mamba 架构',
      target: 'method',
      recency: 'any'
    })

    assert.equal(result.success, true)
    const content = result.content as Record<string, unknown>
    assert.equal(content.quality, 'high')
    assert.equal(content.resultCount, 1)
  })

  it('execute 搜索服务失败时返回失败结果', async () => {
    const mockService = {
      async checkEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
        return { available: true, runtime: 'electron', executable: 'electron.net.fetch' }
      },
      clearEnvironmentCache(): void {},
      async search(input: PaperWebSearchToolInput): Promise<PaperWebSearchOutput> {
        void input
        return {
          success: false,
          query: 'test query',
          quality: 'empty',
          results: [],
          totalDiscovered: 0,
          totalCrawled: 0,
          totalRetained: 0,
          elapsedMs: 100,
          error: '搜索服务不可用'
        }
      }
    }

    const adapter = new PaperWebSearchToolAdapter(mockService as any)
    adapter.setPaperContext(paperContext)
    const result = await adapter.execute('search', {
      query: 'test query',
      reason: 'test reason'
    })

    assert.equal(result.success, false)
    assert.equal(result.error, '搜索服务不可用')
  })

  it('setPaperContext(null) 清除论文上下文', async () => {
    const mockService = new MockPaperWebSearchService()
    const adapter = new PaperWebSearchToolAdapter(mockService as any)

    adapter.setPaperContext(paperContext)
    let result = await adapter.execute('search', {
      query: 'test query',
      reason: 'test reason'
    })
    assert.equal(result.success, true)

    adapter.setPaperContext(null)
    result = await adapter.execute('search', {
      query: 'test query',
      reason: 'test reason'
    })
    assert.equal(result.success, false)
    assert.ok(result.error?.includes('论文上下文'))
  })
})
