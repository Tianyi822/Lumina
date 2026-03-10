/**
 * 流式思考标签解析器
 * 用于处理 LLM 输出中的 <think> 标签，将思考内容和正文内容分离
 */

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

/**
 * 流式思考标签解析状态
 */
export interface StreamThinkParserState {
  inThinkBlock: boolean
  pendingText: string
}

/**
 * 创建初始解析状态
 */
export function createThinkParserState(): StreamThinkParserState {
  return {
    inThinkBlock: false,
    pendingText: ''
  }
}

/**
 * 获取文本尾部与标签前缀重叠的长度
 * 用于处理流式分块导致的半个标签场景
 */
function getTrailingPartialTagLength(text: string, tags: string[]): number {
  let matchedLength = 0

  for (const tag of tags) {
    const maxCheckLength = Math.min(text.length, tag.length - 1)
    for (let len = maxCheckLength; len > matchedLength; len--) {
      if (tag.startsWith(text.slice(-len))) {
        matchedLength = len
        break
      }
    }
  }

  return matchedLength
}

/**
 * 查找下一个 think 标签
 */
function findNextThinkTag(
  text: string,
  startIndex: number
): { index: number; type: 'open' | 'close' } | null {
  const openIndex = text.indexOf(THINK_OPEN_TAG, startIndex)
  const closeIndex = text.indexOf(THINK_CLOSE_TAG, startIndex)

  if (openIndex === -1 && closeIndex === -1) {
    return null
  }

  if (openIndex === -1) {
    return { index: closeIndex, type: 'close' }
  }

  if (closeIndex === -1 || openIndex < closeIndex) {
    return { index: openIndex, type: 'open' }
  }

  return { index: closeIndex, type: 'close' }
}

/**
 * 将 content 中的 think 标签拆分为思考内容和正文内容
 */
export function splitThinkTaggedContent(
  text: string,
  parserState: StreamThinkParserState
): {
  reasoningDelta: string
  contentDelta: string
} {
  const buffer = parserState.pendingText + text
  parserState.pendingText = ''

  let reasoningDelta = ''
  let contentDelta = ''
  let cursor = 0

  while (cursor < buffer.length) {
    if (parserState.inThinkBlock) {
      const closeIndex = buffer.indexOf(THINK_CLOSE_TAG, cursor)
      if (closeIndex === -1) {
        const partialLength = getTrailingPartialTagLength(buffer.slice(cursor), [THINK_CLOSE_TAG])
        const safeEnd = buffer.length - partialLength
        reasoningDelta += buffer.slice(cursor, safeEnd)
        parserState.pendingText = buffer.slice(safeEnd)
        return { reasoningDelta, contentDelta }
      }

      reasoningDelta += buffer.slice(cursor, closeIndex)
      parserState.inThinkBlock = false
      cursor = closeIndex + THINK_CLOSE_TAG.length
      continue
    }

    const nextTag = findNextThinkTag(buffer, cursor)
    if (!nextTag) {
      const partialLength = getTrailingPartialTagLength(buffer.slice(cursor), [
        THINK_OPEN_TAG,
        THINK_CLOSE_TAG
      ])
      const safeEnd = buffer.length - partialLength
      contentDelta += buffer.slice(cursor, safeEnd)
      parserState.pendingText = buffer.slice(safeEnd)
      return { reasoningDelta, contentDelta }
    }

    contentDelta += buffer.slice(cursor, nextTag.index)

    if (nextTag.type === 'open') {
      parserState.inThinkBlock = true
    }

    cursor =
      nextTag.index + (nextTag.type === 'open' ? THINK_OPEN_TAG.length : THINK_CLOSE_TAG.length)
  }

  return { reasoningDelta, contentDelta }
}

/**
 * 在流结束时冲刷剩余的未完成片段
 */
export function flushThinkParserState(parserState: StreamThinkParserState): {
  reasoningDelta: string
  contentDelta: string
} {
  const pendingText = parserState.pendingText
  parserState.pendingText = ''

  if (!pendingText) {
    return { reasoningDelta: '', contentDelta: '' }
  }

  if (parserState.inThinkBlock) {
    parserState.inThinkBlock = false
    if (THINK_CLOSE_TAG.startsWith(pendingText)) {
      return { reasoningDelta: '', contentDelta: '' }
    }
    return { reasoningDelta: pendingText, contentDelta: '' }
  }

  if (THINK_OPEN_TAG.startsWith(pendingText) || THINK_CLOSE_TAG.startsWith(pendingText)) {
    return { reasoningDelta: '', contentDelta: '' }
  }

  return { reasoningDelta: '', contentDelta: pendingText }
}
