import http from 'http'
import https from 'https'

/**
 * 轮询等待 HTTP 服务就绪
 */
export async function waitForHttpReady(
  url: string,
  timeoutMs: number,
  intervalMs: number = 1000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await checkHttpReady(url)) {
      return true
    }

    await sleep(intervalMs)
  }

  return false
}

/**
 * 单次检查 HTTP 服务是否可访问
 */
export async function checkHttpReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url)
      const client = parsedUrl.protocol === 'https:' ? https : http

      const request = client.request(
        parsedUrl,
        {
          method: 'GET',
          timeout: 2000
        },
        (response) => {
          response.resume()

          const statusCode = response.statusCode ?? 0
          resolve(statusCode > 0 && statusCode < 500)
        }
      )

      request.on('timeout', () => {
        request.destroy()
        resolve(false)
      })

      request.on('error', () => {
        resolve(false)
      })

      request.end()
    } catch {
      resolve(false)
    }
  })
}

/**
 * 异步休眠
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
