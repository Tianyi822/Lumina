/**
 * 规范化嵌入 API 的 baseUrl，避免 OpenAI SDK 拼出 /embeddings/embeddings
 * 处理步骤：去除末尾斜杠 → 循环移除尾部 /embeddings 路径段 → 无路径时补 /v1 前缀
 */
export function normalizeEmbeddingBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.trim()
  if (!normalized) {
    return normalized
  }

  // 去除末尾斜杠
  normalized = normalized.replace(/\/+$/, '')

  // 循环移除尾部 /embeddings（防止用户配置了 /v1/embeddings/embeddings 的情况）
  let previous = ''
  while (previous !== normalized) {
    previous = normalized
    normalized = normalized.replace(/\/embeddings$/i, '')
    normalized = normalized.replace(/\/+$/, '')
  }

  // 如果 URL 没有路径，默认补上 /v1 前缀
  try {
    const url = new URL(normalized)
    const path = url.pathname.replace(/\/+$/, '') || ''
    if (path === '' || path === '/') {
      url.pathname = '/v1'
      normalized = url.toString().replace(/\/+$/, '')
    }
  } catch {
    // URL 格式无效时直接返回
    return normalized
  }

  return normalized
}
