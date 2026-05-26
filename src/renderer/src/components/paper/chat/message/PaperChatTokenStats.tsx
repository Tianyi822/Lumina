import { formatTokenCount } from '@renderer/utils/tokenEstimate'
import styles from './PaperChatTokenStats.module.css'

interface PaperChatTokenStatsProps {
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    reasoning_tokens?: number
  }
  userTokenLabel?: string
}

function formatTokenUsage(usage: NonNullable<PaperChatTokenStatsProps['usage']>): string {
  let result = `输入: ${formatTokenCount(usage.prompt_tokens)} | 输出: ${formatTokenCount(
    usage.completion_tokens
  )} | 总计: ${formatTokenCount(usage.total_tokens)}`
  if (usage.reasoning_tokens) {
    result += ` | 思考: ${formatTokenCount(usage.reasoning_tokens)}`
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
