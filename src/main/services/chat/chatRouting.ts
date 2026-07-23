import type { ChatRequest } from '../../types/chat'

/**
 * 复杂度评分结果
 */
export interface ComplexityScore {
  /** 总分(经钳制,最小为 0) */
  total: number
  /** 各维度打分明细 */
  breakdown: { dimension: string; score: number }[]
}

/** 复杂任务关键词(命中 +2) */
const COMPLEX_KEYWORDS = [
  '分析',
  '对比',
  '综述',
  '设计',
  '实现',
  '调试',
  '迁移',
  '优化',
  'plan',
  'compare',
  'analyze',
  'implement'
]

/** 简单任务关键词(命中 -1) */
const SIMPLE_KEYWORDS = ['是什么', '定义', '总结', '翻译']

/** 多步信号关键词(命中 +3) */
const MULTI_STEP_KEYWORDS = ['第一步', '然后', '接着', '阶段', '流程', 'step 1', '首先', '最后']

/** 评分 ≥ 该阈值时自动走 Plan-Execute */
const COMPLEXITY_THRESHOLD = 4

/**
 * 复杂度评分(纯函数,无副作用)
 *
 * 维度:
 * - 长度:>200 字 +1,>500 字 +2
 * - 复杂任务关键词:+2
 * - 简单任务关键词:-1
 * - 多步信号:+3
 *
 * @param content 待评分的文本
 * @returns 评分结果,总分钳制为非负
 */
export function scoreComplexity(content: string): ComplexityScore {
  const breakdown: { dimension: string; score: number }[] = []
  let total = 0

  // 长度维度
  if (content.length > 500) {
    total += 2
    breakdown.push({ dimension: 'length', score: 2 })
  } else if (content.length > 200) {
    total += 1
    breakdown.push({ dimension: 'length', score: 1 })
  }

  const lower = content.toLowerCase()

  // 复杂任务关键词
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) {
    total += 2
    breakdown.push({ dimension: 'keyword', score: 2 })
  }

  // 简单任务关键词
  if (SIMPLE_KEYWORDS.some((k) => content.includes(k))) {
    total -= 1
    breakdown.push({ dimension: 'keyword_simple', score: -1 })
  }

  // 多步信号
  if (MULTI_STEP_KEYWORDS.some((k) => lower.includes(k))) {
    total += 3
    breakdown.push({ dimension: 'multiStep', score: 3 })
  }

  return { total: Math.max(0, total), breakdown }
}

/**
 * 路由决策入参
 *
 * `content` 派生自最后一条用户消息(由 ChatService 调用前提取)。
 * 不直接从 ChatRequest 取字段,因 ChatRequest 仅持有 messages 数组。
 */
export interface ChatRoutingRequest {
  /** 会话类型标识 */
  sessionType?: string
  /** 是否显式启用规划模式(最高优先级,向后兼容) */
  enablePlanMode?: boolean
  /** 待路由判定的文本内容(通常为最后一条用户消息) */
  content?: string
}

/**
 * 判断是否应走 Plan-Execute 路由
 *
 * 决策优先级:
 * 1. 显式 enablePlanMode === true 且为 paper 会话 → true(向后兼容,最高优先级)
 * 2. 非 paper 会话 → false(仅 paper 会话参与自动路由)
 * 3. 无 content 无法评分 → false
 * 4. 启发式评分 ≥ 阈值 → true,否则 false
 *
 * 注:显式开关仍受 paper 会话约束(保持与历史行为一致,非 paper 会话
 * 即使显式 enablePlanMode 也不走 Plan-Execute)。
 */
export function shouldUsePlanExecute(
  request: Pick<ChatRequest, 'sessionType' | 'enablePlanMode'> & { content?: string }
): boolean {
  // 非 paper 会话不参与 Plan-Execute 路由(含显式开关,保持历史行为)
  if (request.sessionType !== 'paper') return false

  // 显式 enablePlanMode 最高优先级(向后兼容)
  if (request.enablePlanMode === true) return true

  // 无 content 无法评分,默认不走
  if (!request.content) return false

  // 启发式评分
  const score = scoreComplexity(request.content)
  return score.total >= COMPLEXITY_THRESHOLD
}
