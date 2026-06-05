import { formatTokenCount } from '@renderer/utils/tokenEstimate'
import type { TokenUsage } from '@shared/types/chat'
import styles from './PaperChatTokenStats.module.css'

interface PaperChatTokenStatsProps {
  usage?: TokenUsage
  userTokenLabel?: string
}

function formatTokenUsage(usage: NonNullable<PaperChatTokenStatsProps['usage']>): string {
  let result = `输入: ${formatTokenCount(usage.prompt_tokens)} | 输出: ${formatTokenCount(
    usage.completion_tokens
  )} | 总计: ${formatTokenCount(usage.total_tokens)}`
  if (usage.reasoning_tokens) {
    result += ` | 思考: ${formatTokenCount(usage.reasoning_tokens)}`
  }
  if (usage.cached_prompt_tokens && usage.cached_prompt_tokens > 0) {
    const hitRate = Math.round((usage.prompt_cache_hit_rate ?? 0) * 100)
    result += ` | 缓存输入: ${formatTokenCount(usage.cached_prompt_tokens)} (${hitRate}%)`
  }
  return result
}

export default function PaperChatTokenStats({ usage, userTokenLabel }: PaperChatTokenStatsProps) {
  if (userTokenLabel) {
    return <div className={styles['token-usage']}>{userTokenLabel}</div>
  }

  if (usage) {
    return <div className={styles['token-usage']}>{formatTokenUsage(usage)}</div>
  }

  return null
}
