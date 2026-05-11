import { logger } from '../logger'
import type { ReleaseInfo } from '@shared/types/update'

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string
  prerelease: boolean
}

export class ReleaseNotesService {
  private cachedReleases: ReleaseInfo[] | null = null
  private cacheTime = 0
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000
  private static readonly PER_PAGE = 20

  constructor(
    private readonly owner: string,
    private readonly repo: string
  ) {}

  async getReleases(): Promise<{ success: boolean; data?: ReleaseInfo[]; error?: string }> {
    if (this.cachedReleases && Date.now() - this.cacheTime < ReleaseNotesService.CACHE_TTL_MS) {
      return { success: true, data: this.cachedReleases }
    }

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases?per_page=${ReleaseNotesService.PER_PAGE}`

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Lumina-App'
        }
      })

      if (response.status === 429) {
        return { success: false, error: '请求过于频繁，请稍后再试' }
      }

      if (!response.ok) {
        return {
          success: false,
          error: `GitHub API 请求失败 (${response.status})`
        }
      }

      const releases = (await response.json()) as GitHubRelease[]
      const result = releases.map(
        (r): ReleaseInfo => ({
          version: r.tag_name.replace(/^v/, ''),
          tagName: r.tag_name,
          name: r.name || r.tag_name,
          body: r.body || '',
          htmlUrl: r.html_url,
          publishedAt: r.published_at,
          isPrerelease: r.prerelease
        })
      )

      this.cachedReleases = result
      this.cacheTime = Date.now()

      return { success: true, data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('获取版本历史失败', 'main', { error: message })
      return { success: false, error: '无法获取版本历史，请检查网络连接' }
    }
  }
}
