import { net } from 'electron'
import { logger } from '@main/services/logger'
import type {
  PaperWebSearchEnvironmentInfo,
  PaperWebSearchOutput,
  PaperWebSearchResultItem,
  PaperWebSearchToolInput
} from '@shared/types/paper-web-search'

interface SearchCandidate {
  title: string
  url: string
  body: string
}

interface SearchWorkingResult extends SearchCandidate {
  snippet: string
  source: string
  relevanceScore: number
  publishedDate?: string
}

interface FetchTextResult {
  ok: boolean
  status: number
  contentType: string
  text: string
}

const SEARCH_TIMEOUT_MS = 30000
const FETCH_TIMEOUT_MS = 10000
const MAX_RESULTS = 5
const MAX_SEARCH_RESULTS = MAX_RESULTS * 2
const MAX_SNIPPET_CHARS = 1000
const MAX_TOTAL_CHARS = 5000
const MAX_HTML_CHARS = 200000

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
}

const PREFERRED_DOMAINS = [
  'arxiv.org',
  'semanticscholar.org',
  'aclanthology.org',
  'openreview.net',
  'github.com',
  'ieee.org',
  'acm.org',
  'paperswithcode.com',
  'huggingface.co'
]

const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'about',
  'related',
  'paper',
  'method',
  'dataset',
  '医学',
  '图像',
  '分割',
  '最新',
  '进展',
  '论文',
  '方法',
  '学习'
])

/**
 * 论文网页搜索服务
 * 使用 DuckDuckGo 搜索论文相关资源，抓取页面内容，排序去重后返回
 */
export class PaperWebSearchService {
  private envCheckCache: PaperWebSearchEnvironmentInfo | null = null

  /**
   * 检查搜索环境是否可用
   */
  async checkEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
    if (this.envCheckCache) {
      return this.envCheckCache
    }

    this.envCheckCache = {
      available: true,
      runtime: 'electron',
      executable: 'electron.net.fetch',
      version: process.versions.electron || process.versions.chrome || process.version,
      dependencyMode: 'builtin'
    }
    return this.envCheckCache
  }

  clearEnvironmentCache(): void {
    this.envCheckCache = null
  }

  /**
   * 执行论文网页搜索
   * 1. 构建查询语句
   * 2. 通过 DuckDuckGo 发现搜索结果
   * 3. 抓取页面内容
   * 4. 排序、去重、评分
   * 5. 返回结构化的搜索结果
   */
  async search(input: PaperWebSearchToolInput): Promise<PaperWebSearchOutput> {
    const startTime = Date.now()
    const query = buildSearchQuery(input)
    const warnings: string[] = []

    if (!query) {
      return this.createFailureOutput(input.query, startTime, '搜索 query 为空')
    }

    try {
      const discovered = await this.discoverSearchResults(query, warnings)
      const normalised = sortByDomain(discovered.filter((item) => isHttpUrl(item.url))).slice(
        0,
        MAX_SEARCH_RESULTS
      )

      let totalCrawled = 0
      const crawledResults: SearchWorkingResult[] = []

      for (const item of normalised) {
        const pageText = await this.fetchPageContent(item.url, warnings)
        if (pageText) {
          totalCrawled += 1
        }

        const snippetSource = pageText || item.body
        const snippet = buildFocusedSnippet(snippetSource, query, MAX_SNIPPET_CHARS)
        if (!snippet) {
          continue
        }

        crawledResults.push({
          ...item,
          snippet,
          source: getSourceName(item.url),
          publishedDate: extractPublishedDate(`${item.title} ${snippet}`),
          relevanceScore: scoreRelevance(query, item.title, snippet, item.url)
        })
      }

      const relevantResults = crawledResults.filter((item) =>
        hasQueryTermMatch(query, item.title, item.snippet)
      )
      const deduped = deduplicateResults(relevantResults)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .filter((item) => item.relevanceScore > 0.2)

      const results = truncateResults(deduped)
      const output: PaperWebSearchOutput = {
        success: true,
        query,
        quality: assessQuality(results, discovered.length),
        results,
        totalDiscovered: discovered.length,
        totalCrawled,
        totalRetained: deduped.length,
        elapsedMs: Date.now() - startTime
      }

      if (warnings.length > 0) {
        output.warnings = warnings.slice(0, 5)
      }

      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('PaperWebSearch: 搜索执行失败', 'main', { query, error: message })
      return this.createFailureOutput(query, startTime, message)
    }
  }

  private async discoverSearchResults(
    query: string,
    warnings: string[]
  ): Promise<SearchCandidate[]> {
    const encodedQuery = encodeURIComponent(query)
    const endpoints = [
      `https://duckduckgo.com/html/?q=${encodedQuery}&kl=us-en`,
      `https://lite.duckduckgo.com/lite/?q=${encodedQuery}&kl=us-en`
    ]

    for (const endpoint of endpoints) {
      try {
        const response = await this.fetchText(endpoint, SEARCH_TIMEOUT_MS)
        if (!response.ok || !response.text.trim()) {
          warnings.push(`搜索入口返回异常: ${response.status}`)
          continue
        }

        const results = parseDuckDuckGoResults(response.text)
        if (results.length > 0) {
          return results
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`搜索入口请求失败: ${message}`)
      }
    }

    return []
  }

  private async fetchPageContent(url: string, warnings: string[]): Promise<string> {
    try {
      const response = await this.fetchText(url, FETCH_TIMEOUT_MS)
      if (!response.ok) {
        warnings.push(`页面抓取失败 ${getSourceName(url)}: ${response.status}`)
        return ''
      }

      if (!isReadableContentType(response.contentType)) {
        return ''
      }

      return cleanHtml(response.text.slice(0, MAX_HTML_CHARS))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`页面抓取失败 ${getSourceName(url)}: ${message}`)
      return ''
    }
  }

  private async fetchText(url: string, timeoutMs: number): Promise<FetchTextResult> {
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), timeoutMs)

    try {
      const response = await net.fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: abortController.signal
      })
      const text = await response.text()

      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        text
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private createFailureOutput(
    query: string,
    startTime: number,
    error: string
  ): PaperWebSearchOutput {
    return {
      success: false,
      query,
      quality: 'empty',
      results: [],
      totalDiscovered: 0,
      totalCrawled: 0,
      totalRetained: 0,
      elapsedMs: Date.now() - startTime,
      error
    }
  }
}

function buildSearchQuery(input: PaperWebSearchToolInput): string {
  const query = input.query.trim()
  const parts = [query]
  const paperTitle = input.paperContext.paperTitle?.trim()

  if (paperTitle && !query.toLowerCase().includes(paperTitle.toLowerCase())) {
    parts.push(`"${paperTitle}"`)
  }

  if (input.recency === 'recent' && !/\b20\d{2}\b/.test(query)) {
    const currentYear = new Date().getFullYear()
    parts.push(String(currentYear - 1), String(currentYear))
  }

  return parts.filter(Boolean).join(' ').trim()
}

function parseDuckDuckGoResults(html: string): SearchCandidate[] {
  const results = [...parseDuckDuckGoHtmlResults(html), ...parseDuckDuckGoLiteResults(html)]
  return deduplicateCandidates(results)
}

function parseDuckDuckGoHtmlResults(html: string): SearchCandidate[] {
  const blocks = html.match(
    /<div[^>]+class=["'][^"']*\bresult\b[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*\bresult\b|$)/gi
  )

  if (!blocks) {
    return []
  }

  return blocks
    .map((block) => {
      const linkMatch = block.match(
        /<a[^>]+class=["'][^"']*\bresult__a\b[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
      )
      if (!linkMatch) {
        return null
      }

      const snippetMatch = block.match(
        /<(?:a|div)[^>]+class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i
      )

      return createCandidate(linkMatch[2], linkMatch[1], snippetMatch?.[1] || '')
    })
    .filter((item): item is SearchCandidate => Boolean(item))
}

function parseDuckDuckGoLiteResults(html: string): SearchCandidate[] {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const results: SearchCandidate[] = []
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1]
    if (!rawHref.includes('uddg=') && !rawHref.startsWith('http')) {
      continue
    }

    const afterLink = html.slice(match.index, Math.min(match.index + 1200, html.length))
    const snippetMatch = afterLink.match(
      /<td[^>]+class=["']result-snippet["'][^>]*>([\s\S]*?)<\/td>/i
    )
    const candidate = createCandidate(match[2], rawHref, snippetMatch?.[1] || '')
    if (candidate) {
      results.push(candidate)
    }
  }

  return results
}

function createCandidate(
  rawTitle: string,
  rawUrl: string,
  rawBody: string
): SearchCandidate | null {
  const url = normalizeSearchResultUrl(rawUrl)
  const title = normaliseWhitespace(stripTags(rawTitle))
  const body = normaliseWhitespace(stripTags(rawBody))

  if (!title || !isHttpUrl(url) || isSearchEngineUrl(url)) {
    return null
  }

  return { title, url, body }
}

function normalizeSearchResultUrl(rawUrl: string): string {
  const decodedUrl = decodeHtmlEntities(rawUrl).trim()
  const absoluteUrl = decodedUrl.startsWith('//')
    ? `https:${decodedUrl}`
    : decodedUrl.startsWith('/')
      ? `https://duckduckgo.com${decodedUrl}`
      : decodedUrl

  try {
    const parsed = new URL(absoluteUrl)
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) {
      return decodeURIComponent(uddg)
    }
    return parsed.href
  } catch {
    return decodedUrl
  }
}

function cleanHtml(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|nav|footer|header|aside|noscript|iframe|form|button|svg)\b[\s\S]*?<\/\1>/gi,
      ' '
    )
    .replace(
      /<[^>]+\b(?:aria-hidden|hidden)=["']?(?:true|hidden)?["']?[^>]*>[\s\S]*?<\/[^>]+>/gi,
      ' '
    )
    .replace(/<(br|p|div|section|article|li|tr|h[1-6])\b[^>]*>/gi, '\n')

  return normaliseWhitespace(stripTags(withoutNoise))
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildFocusedSnippet(text: string, query: string, maxChars: number): string {
  const cleanText = normaliseWhitespace(text)
  if (!cleanText) {
    return ''
  }

  const lowerText = cleanText.toLowerCase()
  const terms = extractQueryTerms(query)
  const hitIndex = terms
    .map((term) => lowerText.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  if (hitIndex === undefined) {
    return cleanText.slice(0, maxChars)
  }

  const start = Math.max(0, hitIndex - Math.floor(maxChars / 3))
  const snippet = cleanText.slice(start, start + maxChars)
  return `${start > 0 ? '...' : ''}${snippet}${start + maxChars < cleanText.length ? '...' : ''}`
}

function extractQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/["'()]/g, ' ')
        .split(/[\s,，。;；:：/\\|]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    )
  )
}

function scoreRelevance(query: string, title: string, snippet: string, url: string): number {
  const terms = extractQueryTerms(query)
  const haystack = `${title} ${snippet}`.toLowerCase()
  const matchedTerms = terms.filter((term) => haystack.includes(term.toLowerCase())).length
  const termScore = terms.length > 0 ? matchedTerms / terms.length : 0.2
  const domainScore = scoreDomain(url) / PREFERRED_DOMAINS.length

  return Number(Math.min(1, 0.15 + termScore * 0.55 + domainScore * 0.3).toFixed(3))
}

function hasQueryTermMatch(query: string, title: string, snippet: string): boolean {
  const terms = extractQueryTerms(query)
  if (terms.length === 0) {
    return true
  }

  const haystack = `${title} ${snippet}`.toLowerCase()
  return terms.some((term) => haystack.includes(term.toLowerCase()))
}

function scoreDomain(url: string): number {
  const hostname = getHostname(url)
  const preferredIndex = PREFERRED_DOMAINS.findIndex((domain) => hostname.includes(domain))
  return preferredIndex >= 0 ? PREFERRED_DOMAINS.length - preferredIndex : 0
}

function sortByDomain(results: SearchCandidate[]): SearchCandidate[] {
  return [...results].sort((a, b) => scoreDomain(b.url) - scoreDomain(a.url))
}

function deduplicateCandidates(results: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>()
  const deduped: SearchCandidate[] = []

  for (const result of results) {
    const key = urlFingerprint(result.url)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(result)
  }

  return deduped
}

function deduplicateResults(results: SearchWorkingResult[]): SearchWorkingResult[] {
  const seenUrls = new Set<string>()
  const seenTitles: string[] = []
  const deduped: SearchWorkingResult[] = []

  for (const result of results) {
    const urlKey = urlFingerprint(result.url)
    if (seenUrls.has(urlKey)) {
      continue
    }

    if (seenTitles.some((title) => titlesAreSimilar(result.title, title))) {
      continue
    }

    seenUrls.add(urlKey)
    seenTitles.push(result.title)
    deduped.push(result)
  }

  return deduped
}

function truncateResults(results: SearchWorkingResult[]): PaperWebSearchResultItem[] {
  const truncated: PaperWebSearchResultItem[] = []
  let totalChars = 0

  for (const result of results.slice(0, MAX_RESULTS)) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      break
    }

    const remaining = MAX_TOTAL_CHARS - totalChars
    const snippet = result.snippet.slice(0, Math.min(MAX_SNIPPET_CHARS, remaining))
    totalChars += snippet.length

    truncated.push({
      title: result.title,
      url: result.url,
      source: result.source,
      publishedDate: result.publishedDate,
      snippet,
      relevanceScore: result.relevanceScore
    })
  }

  return truncated
}

function assessQuality(
  results: PaperWebSearchResultItem[],
  totalDiscovered: number
): 'high' | 'medium' | 'low' | 'empty' {
  if (results.length === 0) {
    return totalDiscovered > 0 ? 'low' : 'empty'
  }

  if (results.length >= 3 && results.some((result) => scoreDomain(result.url) > 0)) {
    return 'high'
  }

  return 'medium'
}

function urlFingerprint(url: string): string {
  try {
    const parsed = new URL(url.toLowerCase())
    parsed.hash = ''
    parsed.search = ''
    parsed.pathname = parsed.pathname.replace(/\/$/, '')
    return parsed.toString()
  } catch {
    return url.toLowerCase().trim()
  }
}

function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titlesAreSimilar(a: string, b: string): boolean {
  const first = titleFingerprint(a)
  const second = titleFingerprint(b)
  if (!first || !second) {
    return false
  }

  if (first.includes(second) || second.includes(first)) {
    return true
  }

  const firstWords = new Set(first.split(' '))
  const secondWords = new Set(second.split(' '))
  const intersection = [...firstWords].filter((word) => secondWords.has(word)).length
  const union = new Set([...firstWords, ...secondWords]).size
  return union > 0 && intersection / union >= 0.55
}

function extractPublishedDate(value: string): string | undefined {
  const exactDate = value.match(
    /\b(20\d{2}|19\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/
  )
  if (exactDate) {
    const [, year, month, day] = exactDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const year = value.match(/\b(20\d{2}|19\d{2})\b/)
  return year?.[1]
}

function getSourceName(url: string): string {
  const hostname = getHostname(url)
  return hostname.replace(/^www\./, '') || 'unknown'
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function isSearchEngineUrl(url: string): boolean {
  const hostname = getHostname(url)
  return hostname.includes('duckduckgo.com')
}

function isReadableContentType(contentType: string): boolean {
  const lowerContentType = contentType.toLowerCase()
  return (
    !lowerContentType ||
    lowerContentType.includes('text/html') ||
    lowerContentType.includes('application/xhtml') ||
    lowerContentType.includes('text/plain')
  )
}
