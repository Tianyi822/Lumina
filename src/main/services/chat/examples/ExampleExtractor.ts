// 示例提取器，从历史会话中提取高质量的 Few-shot 示例
import type { SessionMessage } from '@shared/types/session'
import type { SessionData } from '@shared/types/session'
import type { EnhancedFewShotExample, ExampleExtractionResult } from '../prompts/types'
import { logger } from '../../logger'

// ReAct 模式提取结果
interface ReActPattern {
  // 模式起始消息索引
  startIndex: number
  // 用户查询
  userQuery: string
  // 思考过程
  thoughts: string[]
  // 工具调用序列
  toolCalls: Array<{
    name: string
    arguments: Record<string, unknown>
    result: string
    success: boolean
  }>
  // 最终答案
  finalAnswer: string
  // 是否包含错误
  hasErrors: boolean
}

// 示例提取器
export class ExampleExtractor {
  // 从会话列表中提取示例
  extractFromSessions(sessions: SessionData[]): ExampleExtractionResult {
    const examples: EnhancedFewShotExample[] = []
    let processedSessions = 0
    let skippedSessions = 0
    const errors: string[] = []

    for (const session of sessions) {
      try {
        const patterns = this.extractPatternsFromSession(session)
        if (patterns.length > 0) {
          for (const pattern of patterns) {
            const example = this.createExampleFromPattern(pattern, session.sessionId)
            examples.push(example)
          }
          processedSessions++
        } else {
          skippedSessions++
        }
      } catch (error) {
        skippedSessions++
        errors.push(
          `会话 ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return {
      examples,
      processedSessions,
      skippedSessions,
      errors
    }
  }

  // 从单个会话中提取 ReAct 模式
  private extractPatternsFromSession(session: SessionData): ReActPattern[] {
    const patterns: ReActPattern[] = []
    const messages = session.messages

    // 调试日志：检查会话消息结构
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')
    const toolMsgs = messages.filter((m) => m.role === 'tool')
    const assistantWithToolCalls = assistantMsgs.filter(
      (m) => m.tool_calls && m.tool_calls.length > 0
    )

    // 打印 tool_calls 和 tool_call_id 详细信息
    const toolCallIds: string[] = []
    for (const m of assistantWithToolCalls) {
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          toolCallIds.push(tc.id)
        }
      }
    }
    const toolResultIds = toolMsgs.map((m) => m.tool_call_id)

    logger.debug('会话消息分析', 'main', {
      sessionId: session.sessionId,
      totalMessages: messages.length,
      assistantCount: assistantMsgs.length,
      toolCount: toolMsgs.length,
      assistantWithToolCalls: assistantWithToolCalls.length,
      toolCallIds,
      toolResultIds
    })

    // 寻找 ReAct 循环模式
    let i = 0
    let attemptCount = 0
    while (i < messages.length) {
      attemptCount++
      const pattern = this.tryExtractReActPattern(messages, i)
      if (pattern) {
        logger.info('提取到 ReAct 模式', 'main', {
          startIndex: i,
          toolCallsCount: pattern.toolCalls.length,
          hasErrors: pattern.hasErrors,
          userQueryPreview: pattern.userQuery.substring(0, 50) + '...'
        })
        // 只保留没有错误的模式
        if (!pattern.hasErrors && pattern.toolCalls.length > 0) {
          patterns.push(pattern)
        }
        // 跳过已处理的消息
        i += this.countMessagesInPattern(pattern)
      } else {
        if (attemptCount <= 5) {
          // 只打印前5次失败
          logger.info('未能提取模式', 'main', {
            startIndex: i,
            messageRole: messages[i]?.role,
            messageContentPreview: messages[i]?.content?.substring(0, 30)
          })
        }
        i++
      }
    }

    logger.info('模式提取完成', 'main', {
      sessionId: session.sessionId,
      attemptCount,
      patternsFound: patterns.length
    })

    return patterns
  }

  // 尝试从当前位置提取 ReAct 模式
  private tryExtractReActPattern(
    messages: SessionMessage[],
    startIndex: number
  ): ReActPattern | null {
    if (startIndex >= messages.length) return null

    const pattern: ReActPattern = {
      startIndex,
      userQuery: '',
      thoughts: [],
      toolCalls: [],
      finalAnswer: '',
      hasErrors: false
    }

    let currentIndex = startIndex

    // 1. 查找用户查询
    const userMsg = messages[currentIndex]
    if (userMsg.role !== 'user' || !userMsg.content) {
      return null
    }
    pattern.userQuery = userMsg.content
    currentIndex++

    // 2. 查找助手响应和工具调用
    while (currentIndex < messages.length) {
      const msg = messages[currentIndex]

      // 助手消息
      if (msg.role === 'assistant') {
        // 提取思考过程
        if (msg.reasoning) {
          pattern.thoughts.push(msg.reasoning)
        } else if (msg.content) {
          pattern.thoughts.push(msg.content)
        }

        // 提取工具调用
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const toolCall of msg.tool_calls) {
            const args = this.parseToolArguments(toolCall.function.arguments)

            // 查找工具结果
            const toolResult = this.findToolResult(messages, currentIndex + 1, toolCall.id)
            if (toolResult) {
              pattern.toolCalls.push({
                name: toolCall.function.name,
                arguments: args,
                result: toolResult.content || '',
                success: !this.isErrorResult(toolResult.content)
              })

              if (this.isErrorResult(toolResult.content)) {
                pattern.hasErrors = true
              }
            } else {
              logger.debug('未找到工具结果', 'main', {
                toolCallId: toolCall.id,
                toolName: toolCall.function.name
              })
            }
          }
          currentIndex++
        }
      } else if (msg.role === 'tool') {
        // 工具消息，继续
        currentIndex++
      } else if (msg.role === 'user') {
        // 下一个用户查询，结束当前模式
        break
      } else {
        currentIndex++
      }
    }

    // 3. 如果没有工具调用，跳过
    if (pattern.toolCalls.length === 0) {
      return null
    }

    // 4. 提取最终答案（最后一个助手消息的内容）
    const lastAssistantMsg = this.findLastAssistantMessage(messages, startIndex, currentIndex)
    if (lastAssistantMsg && lastAssistantMsg.content) {
      pattern.finalAnswer = lastAssistantMsg.content
    }

    return pattern
  }

  // 查找工具结果
  private findToolResult(
    messages: SessionMessage[],
    startIndex: number,
    toolCallId: string
  ): SessionMessage | null {
    for (let i = startIndex; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.role === 'tool' && msg.tool_call_id === toolCallId) {
        return msg
      }
      if (msg.role === 'assistant') {
        // 遇到新的助手消息，停止查找
        break
      }
    }
    return null
  }

  // 查找最后一个助手消息
  private findLastAssistantMessage(
    messages: SessionMessage[],
    startIndex: number,
    endIndex: number
  ): SessionMessage | null {
    for (let i = endIndex - 1; i >= startIndex; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && msg.content && !msg.tool_calls) {
        return msg
      }
    }
    return null
  }

  // 解析工具参数
  private parseToolArguments(argsString: string): Record<string, unknown> {
    try {
      return JSON.parse(argsString)
    } catch {
      return {}
    }
  }

  // 判断是否是错误结果
  private isErrorResult(content: string | null): boolean {
    if (!content) return false
    const errorIndicators = ['error:', 'failed', 'exception', 'cannot', 'unable']
    const lowerContent = content.toLowerCase()
    return errorIndicators.some((indicator) => lowerContent.includes(indicator))
  }

  // 计算模式包含的消息数
  private countMessagesInPattern(pattern: ReActPattern): number {
    // 用户消息 + 思考消息 + 工具调用消息 + 工具结果消息 + 最终答案消息
    let count = 1 // 用户消息
    count += pattern.thoughts.length
    count += pattern.toolCalls.length * 2 // 每个工具调用有1个调用消息和1个结果消息
    if (pattern.finalAnswer) {
      count += 1
    }
    return count
  }

  // 从模式创建示例
  private createExampleFromPattern(
    pattern: ReActPattern,
    sessionId: string
  ): EnhancedFewShotExample {
    const now = new Date().toISOString()

    return {
      id: `${sessionId}-${pattern.startIndex}`,
      userQuery: pattern.userQuery,
      thought: pattern.thoughts.join('\n\n'),
      toolCalls: pattern.toolCalls.map((tc) => ({
        name: tc.name,
        arguments: tc.arguments,
        result: tc.result
      })),
      finalAnswer: pattern.finalAnswer,
      qualityScore: 0, // 将由 ExampleScorer 计算
      usageCount: 0,
      source: 'dynamic',
      toolsUsed: pattern.toolCalls.map((tc) => tc.name),
      createdAt: now,
      sourceSessionId: sessionId,
      successRate: pattern.toolCalls.every((tc) => tc.success) ? 1 : 0
    }
  }
}
