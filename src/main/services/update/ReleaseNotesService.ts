import { net } from 'electron'
import type { ReleaseInfo } from '@shared/types/update'

import { logger } from '../logger'

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string
  prerelease: boolean
}

interface ReleaseFetchResult {
  success: boolean
  data?: ReleaseInfo[]
  error?: string
  rateLimited?: boolean
}

export class ReleaseNotesService {
  private cachedReleases: ReleaseInfo[] | null = null
  private cacheTime = 0
  private readonly owner: string
  private readonly repo: string
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000
  private static readonly PER_PAGE = 20

  constructor(owner: string, repo: string) {
    this.owner = owner
    this.repo = repo
  }

  async getReleases(): Promise<{ success: boolean; data?: ReleaseInfo[]; error?: string }> {
    if (this.cachedReleases && Date.now() - this.cacheTime < ReleaseNotesService.CACHE_TTL_MS) {
      return { success: true, data: this.cachedReleases }
    }

    const apiResult = await this.fetchApiReleases()
    if (apiResult.success && apiResult.data && apiResult.data.length > 0) {
      return this.cacheAndReturn(apiResult.data)
    }

    const atomResult = await this.fetchAtomReleases()
    if (atomResult.success && atomResult.data) {
      return this.cacheAndReturn(atomResult.data)
    }

    if (apiResult.success && apiResult.data) {
      return this.cacheAndReturn(apiResult.data)
    }

    return {
      success: false,
      error: apiResult.error || atomResult.error || '无法获取版本历史，请检查网络连接'
    }
  }

  /**
   * 通过 GitHub REST API 获取 Release 列表
   * 请求失败时会记录日志并返回错误信息
   */
  private async fetchApiReleases(): Promise<ReleaseFetchResult> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases?per_page=${ReleaseNotesService.PER_PAGE}`

    try {
      const response = await net.fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Lumina-App'
        }
      })

      if (!response.ok) {
        const body = await response.text()
        const rateLimited = this.isRateLimitedResponse(response, body)
        const error = rateLimited ? '请求过于频繁，请稍后再试' : 'GitHub Releases API 暂时不可用'
        logger.warn('GitHub Releases API 请求失败，尝试 Atom feed 回退', 'main', {
          status: response.status,
          rateLimited
        })
        return { success: false, error, rateLimited }
      }

      const releases = await this.readApiReleases(response)
      return { success: true, data: releases.map((release) => this.mapApiRelease(release)) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('获取版本历史失败', 'main', { error: message })
      return { success: false, error: '无法获取版本历史，请检查网络连接' }
    }
  }

  /**
   * 通过 GitHub Atom feed 获取 Release 列表
   * 作为 API 请求失败时的降级方案
   */
  private async fetchAtomReleases(): Promise<ReleaseFetchResult> {
    const url = `https://github.com/${this.owner}/${this.repo}/releases.atom`

    try {
      const response = await net.fetch(url, {
        headers: {
          Accept: 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
          'User-Agent': 'Lumina-App'
        }
      })

      if (!response.ok) {
        logger.warn('GitHub Releases Atom feed 请求失败', 'main', { status: response.status })
        return { success: false, error: 'GitHub 版本历史暂时不可用' }
      }

      const feed = await response.text()
      return { success: true, data: this.parseAtomReleases(feed) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('获取版本历史 Atom feed 失败', 'main', { error: message })
      return { success: false, error: '无法获取版本历史，请检查网络连接' }
    }
  }

  /**
   * 解析 GitHub API 返回的 Release 数据
   */
  private async readApiReleases(response: Response): Promise<GitHubRelease[]> {
    const raw = (await response.json()) as unknown
    if (!Array.isArray(raw)) {
      return []
    }
    return raw.filter((item): item is GitHubRelease => this.isGitHubRelease(item))
  }

  /**
   * 类型守卫：判断是否为有效的 GitHub Release 对象
   */
  private isGitHubRelease(value: unknown): value is GitHubRelease {
    if (!value || typeof value !== 'object') {
      return false
    }
    const release = value as Record<string, unknown>
    return (
      typeof release.tag_name === 'string' &&
      (typeof release.name === 'string' || release.name === null) &&
      (typeof release.body === 'string' || release.body === null) &&
      typeof release.html_url === 'string' &&
      typeof release.published_at === 'string' &&
      typeof release.prerelease === 'boolean'
    )
  }

  /**
   * 将 GitHub API Release 格式转换为应用内部 ReleaseInfo 格式
   */
  private mapApiRelease(release: GitHubRelease): ReleaseInfo {
    return {
      version: release.tag_name.replace(/^v/, ''),
      tagName: release.tag_name,
      name: release.name || release.tag_name,
      body: release.body || '',
      htmlUrl: release.html_url,
      publishedAt: release.published_at,
      isPrerelease: release.prerelease
    }
  }

  /**
   * 解析 Atom feed XML 中的 Release 条目
   */
  private parseAtomReleases(feed: string): ReleaseInfo[] {
    const entries = Array.from(feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g))
    return entries
      .map((match) => this.parseAtomEntry(match[1]))
      .filter((release): release is ReleaseInfo => release !== null)
      .slice(0, ReleaseNotesService.PER_PAGE)
  }

  /**
   * 解析单条 Atom entry 为 ReleaseInfo
   * 包含标题、发布时间、内容、预发布标记等字段
   */
  private parseAtomEntry(entry: string): ReleaseInfo | null {
    const title = this.getXmlTagText(entry, 'title')
    const updated = this.getXmlTagText(entry, 'updated')
    const htmlUrl = this.getAtomAlternateUrl(entry)
    const content = this.getXmlTagText(entry, 'content') || ''

    if (!title || !updated || !htmlUrl) {
      return null
    }

    const tagName = this.extractTagNameFromReleaseUrl(htmlUrl) || title.split(':')[0].trim()
    return {
      version: tagName.replace(/^v/, ''),
      tagName,
      name: title,
      body: this.htmlToMarkdown(content),
      htmlUrl,
      publishedAt: updated,
      isPrerelease: /\b(alpha|beta|rc|preview)\b/i.test(`${tagName} ${title}`)
    }
  }

  /**
   * 从 XML 字符串中提取指定标签的文本内容
   * 支持带属性的标签
   */
  private getXmlTagText(source: string, tagName: string): string | null {
    const match = source.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`))
    return match ? this.decodeXmlEntities(match[1].trim()) : null
  }

  /**
   * 从 Atom entry 中提取 altername link 的 href 属性
   */
  private getAtomAlternateUrl(entry: string): string | null {
    const match = entry.match(/<link\b(?=[^>]*\brel="alternate")(?=[^>]*\bhref="([^"]+)")[^>]*>/)
    return match ? this.decodeXmlEntities(match[1]) : null
  }

  /**
   * 从 Release URL 中提取 tag 名称
   */
  private extractTagNameFromReleaseUrl(url: string): string | null {
    const marker = '/releases/tag/'
    const markerIndex = url.indexOf(marker)
    if (markerIndex < 0) {
      return null
    }
    return decodeURIComponent(url.slice(markerIndex + marker.length))
  }

  /**
   * 将 HTML 格式的 Release body 转换为 Markdown
   * 支持标题、列表、加粗、斜体等常用标签
   */
  private htmlToMarkdown(html: string): string {
    const withBlocks = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, text: string) => {
        return `\n\n${'#'.repeat(Number(level))} ${this.stripHtml(text).trim()}\n\n`
      })
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, text: string) => {
        return `\n- ${this.stripHtml(text).trim().replace(/\n+/g, '\n  ')}`
      })
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/t[hd]>/gi, ' | ')
      .replace(/<\/(?:ul|ol|table|thead|tbody)>/gi, '\n\n')

    return this.stripHtml(withBlocks)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  /**
   * 移除 HTML 标签，保留加粗/斜体等 Markdown 语法
   */
  private stripHtml(html: string): string {
    return this.decodeXmlEntities(
      html
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
        .replace(/<[^>]+>/g, '')
    )
  }

  /**
   * 解码 XML 实体字符
   * 支持 &lt; &gt; &quot; &#39; &amp; 及数字/十六进制字符引用
   */
  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
        String.fromCodePoint(parseInt(code, 16))
      )
  }

  /**
   * 判断响应是否为速率限制导致
   * 检查 429 状态码或 403 中剩余配额为 0 的情况
   */
  private isRateLimitedResponse(response: Response, body: string): boolean {
    return (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' ||
          body.toLowerCase().includes('rate limit')))
    )
  }

  /**
   * 缓存结果并返回
   * 缓存有效期为 10 分钟
   */
  private cacheAndReturn(releases: ReleaseInfo[]): { success: boolean; data: ReleaseInfo[] } {
    this.cachedReleases = releases
    this.cacheTime = Date.now()
    return { success: true, data: releases }
  }
}
