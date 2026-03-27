import { encode } from 'gpt-tokenizer/encoding/cl100k_base'

/**
 * 计算文本的 Token 数量
 * 使用 cl100k_base BPE 分词器（GPT-4 / GPT-3.5-turbo 编码）精确计算
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0
  return encode(text).length
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
