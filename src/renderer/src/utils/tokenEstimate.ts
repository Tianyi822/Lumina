/**
 * 估算文本的 Token 数量
 * 中文按约 0.5 token/字符，其他字符按约 0.25 token/字符估算
 */
export function estimateTokenCount(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars

  return Math.ceil(chineseChars / 2 + otherChars / 4)
}

/**
 * 格式化 Token 数量显示
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${formatCompactNumber(tokens / 1000000)}M tokens`
  }

  if (tokens >= 1000) {
    return `${formatCompactNumber(tokens / 1000)}K tokens`
  }

  return `${tokens} tokens`
}

function formatCompactNumber(value: number): string {
  const formatted = value.toFixed(1)
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
}
