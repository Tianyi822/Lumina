// src/main/services/chat/harness/trace/TokenEstimator.ts
/**
 * Token 粗估器(chars/3.5,中英文混合经验值)。
 * 调用前预估防"单次调用就超预算",调用后用模型返回的真实 usage 校准。
 *
 * 不引入 tiktoken(避免打包体积 + 模型特定 bpe 文件)。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §5.4
 */
import type { ChatMessage } from '@shared/types/chat'

/** OpenAI function 工具定义(简化,与现有 ToolDef 对齐) */
interface ToolDef {
  name: string
  description?: string
  parameters?: unknown // JSON Schema
}

const CHARS_PER_TOKEN = 3.5
const MIN_CALIBRATION = 0.5
const MAX_CALIBRATION = 3.0

export class TokenEstimator {
  private calibrationRatio = 1.0

  /**
   * 调用前预估。
   * @returns 估算 token 数(≥0)
   */
  estimatePreCall(messages: ChatMessage[], tools: ToolDef[]): number {
    const text = this.serialize(messages, tools)
    if (text.length === 0) return 0
    const raw = Math.ceil(text.length / CHARS_PER_TOKEN)
    return Math.ceil(raw * this.calibrationRatio)
  }

  /**
   * 调用后校准。用实际 usage 修正 calibrationRatio,下次估算更准。
   * @returns 实际 usage(透传,方便调用方记账)
   */
  reconcilePostCall(estimated: number, actual: number): number {
    if (estimated <= 0 || actual <= 0) return actual
    const ratio = actual / estimated
    // 钳制到合理区间,避免极端值污染校准
    this.calibrationRatio = Math.max(MIN_CALIBRATION, Math.min(MAX_CALIBRATION, ratio))
    return actual
  }

  /** 测试用:读取当前校准比率 */
  getCalibrationRatio(): number {
    return this.calibrationRatio
  }

  private serialize(messages: ChatMessage[], tools: ToolDef[]): string {
    // 仅统计 content 文本长度,不计 role 前缀(保持 chars/3.5 的纯比率,
    // 使 350 字符 → 100 token 的契约成立;role 是元数据噪声,粗估可忽略)
    const msgText = messages
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
        return content
      })
      .join('\n')
    const toolText = tools
      .map((t) => `${t.name}:${t.description ?? ''}:${JSON.stringify(t.parameters ?? {})}`)
      .join('\n')
    // 过滤空段,避免空输入产生多余分隔符导致 length>0
    return [msgText, toolText].filter((s) => s.length > 0).join('\n')
  }
}
