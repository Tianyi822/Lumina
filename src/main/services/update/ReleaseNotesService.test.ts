import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { ReleaseNotesService } from './ReleaseNotesService'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('API 限流时回退 Atom feed 获取版本历史', async () => {
  const calls: string[] = []
  const atomFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <updated>2026-05-15T23:25:46Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/Tianyi822/Lumina/releases/tag/v1.3.1"/>
    <title>v1.3.1</title>
    <content type="html">&lt;h2&gt;v1.3.1&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;&lt;strong&gt;新功能&lt;/strong&gt;：修复版本历史&lt;/li&gt;&lt;/ul&gt;</content>
  </entry>
</feed>`

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    calls.push(url)

    if (url.includes('api.github.com')) {
      return new Response(
        JSON.stringify({
          message: 'API rate limit exceeded'
        }),
        {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0'
          }
        }
      )
    }

    return new Response(atomFeed, { status: 200 })
  }

  const service = new ReleaseNotesService('Tianyi822', 'Lumina')
  const result = await service.getReleases()

  assert.equal(result.success, true)
  assert.equal(result.data?.length, 1)
  assert.equal(result.data?.[0].version, '1.3.1')
  assert.equal(result.data?.[0].tagName, 'v1.3.1')
  assert.equal(result.data?.[0].htmlUrl, 'https://github.com/Tianyi822/Lumina/releases/tag/v1.3.1')
  assert.match(result.data?.[0].body || '', /新功能/)
  assert.deepEqual(calls, [
    'https://api.github.com/repos/Tianyi822/Lumina/releases?per_page=20',
    'https://github.com/Tianyi822/Lumina/releases.atom'
  ])
})

test('API 正常时直接使用 Releases JSON', async () => {
  const calls: string[] = []

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    return new Response(
      JSON.stringify([
        {
          tag_name: 'v1.3.1',
          name: 'v1.3.1',
          body: '## 更新说明',
          html_url: 'https://github.com/Tianyi822/Lumina/releases/tag/v1.3.1',
          published_at: '2026-05-15T23:25:46Z',
          prerelease: false
        }
      ]),
      { status: 200 }
    )
  }

  const service = new ReleaseNotesService('Tianyi822', 'Lumina')
  const result = await service.getReleases()

  assert.equal(result.success, true)
  assert.equal(result.data?.[0].body, '## 更新说明')
  assert.deepEqual(calls, ['https://api.github.com/repos/Tianyi822/Lumina/releases?per_page=20'])
})
