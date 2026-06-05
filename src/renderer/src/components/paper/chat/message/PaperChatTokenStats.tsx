import { formatTokenCount } from '@renderer/utils/tokenEstimate'
import type { TokenUsage } from '@shared/types/chat'
import styles from './PaperChatTokenStats.module.css'

interface PaperChatTokenStatsProps {
  usage?: TokenUsage
  userTokenLabel?: string
}

function formatCacheHitRate(rate: number, cachedPromptTokens: number): string {
  if (cachedPromptTokens <= 0 || rate <= 0) {
    return '0%'
  }

  const percent = rate * 100
  if (percent < 1) {
    return '<1%'
  }

  if (percent < 10) {
    return `${percent.toFixed(1)}%`
  }

  return `${Math.round(percent)}%`
}

function formatTokenUsage(usage: NonNullable<PaperChatTokenStatsProps['usage']>): string {
  const cachedPromptTokens = usage.cached_prompt_tokens ?? 0
  const hitRate = formatCacheHitRate(usage.prompt_cache_hit_rate ?? 0, cachedPromptTokens)
  return `总计: ${formatTokenCount(usage.total_tokens)} | 缓存输入: ${formatTokenCount(
    cachedPromptTokens
  )} (${hitRate})`
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
