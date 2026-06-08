/**
 * 规范化嵌入 API 的 baseUrl，避免 OpenAI SDK 拼出 /embeddings/embeddings
 */
export function normalizeEmbeddingBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.trim()
  if (!normalized) {
    return normalized
  }

  normalized = normalized.replace(/\/+$/, '')

  let previous = ''
  while (previous !== normalized) {
    previous = normalized
    normalized = normalized.replace(/\/embeddings$/i, '')
    normalized = normalized.replace(/\/+$/, '')
  }

  try {
    const url = new URL(normalized)
    const path = url.pathname.replace(/\/+$/, '') || ''
    if (path === '' || path === '/') {
      url.pathname = '/v1'
      normalized = url.toString().replace(/\/+$/, '')
    }
  } catch {
    return normalized
  }

  return normalized
}
