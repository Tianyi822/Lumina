import { afterEach, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { PaperWebSearchService } from './PaperWebSearchService.ts'
import type { PaperWebSearchToolInput } from '@shared/types/paper-web-search'

const SEARCH_HTML = `
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=${encodeURIComponent(
      'https://arxiv.org/abs/2401.00001'
    )}">Mamba for Medical Image Segmentation</a>
    <a class="result__snippet">A 2024 paper about Mamba and medical image segmentation.</a>
  </div>
`

const PAGE_HTML = `
  <html>
    <head><title>Mamba for Medical Image Segmentation</title></head>
    <body>
      <nav>navigation</nav>
      <article>
        <h1>Mamba for Medical Image Segmentation</h1>
        <p>This 2024 study evaluates Mamba state space models for medical image segmentation.</p>
        <p>It discusses few-shot learning comparisons and recent progress in segmentation models.</p>
      </article>
    </body>
  </html>
`

function createInput(): PaperWebSearchToolInput {
  return {
    query: 'Mamba medical image segmentation few-shot learning',
    reason: 'test reason',
    target: 'recent_progress',
    recency: 'recent',
    paperContext: {
      paperId: 'paper-1',
      fileName: 'paper.pdf',
      userQuestion: 'What is recent progress?'
    }
  }
}

function mockFetch(): void {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('duckduckgo.com')) {
      return new Response(SEARCH_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }

    if (url.includes('arxiv.org')) {
      return new Response(PAGE_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }

    return new Response('', { status: 404 })
  })
}

describe('PaperWebSearchService', () => {
  afterEach(() => {
    mock.reset()
  })

  it('checkEnvironment 返回 Electron 内置搜索运行时', async () => {
    const service = new PaperWebSearchService()
    const result = await service.checkEnvironment()

    assert.equal(result.available, true)
    assert.equal(result.runtime, 'electron')
    assert.equal(result.executable, 'electron.net.fetch')
    assert.equal(result.dependencyMode, 'builtin')
  })

  it('checkEnvironment 第二次调用使用缓存', async () => {
    const service = new PaperWebSearchService()

    const first = await service.checkEnvironment()
    const second = await service.checkEnvironment()

    assert.equal(first, second)
  })

  it('clearEnvironmentCache 后重新检测', async () => {
    const service = new PaperWebSearchService()

    const first = await service.checkEnvironment()
    service.clearEnvironmentCache()
    const second = await service.checkEnvironment()

    assert.notEqual(first, second)
  })

  it('search 使用 Electron fetch 搜索、抓取并返回结构化结果', async () => {
    mockFetch()
    const service = new PaperWebSearchService()
    const result = await service.search(createInput())

    assert.equal(result.success, true)
    assert.equal(result.totalDiscovered, 1)
    assert.equal(result.totalCrawled, 1)
    assert.equal(result.totalRetained, 1)
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].source, 'arxiv.org')
    assert.match(result.results[0].snippet, /few-shot learning/)
    assert.ok(result.results[0].relevanceScore > 0)
  })
})
