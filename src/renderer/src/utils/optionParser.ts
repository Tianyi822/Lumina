export interface ParsedOption {
  id: string
  label: string
  fullText: string
}

export interface ParsedOptions {
  hasOptions: boolean
  question: string
  options: ParsedOption[]
  suffix: string
}

export interface MessageOptionContext extends ParsedOptions {
  messageId: string
}

type OptionKind = 'alpha' | 'numeric'
type OptionStyle = 'dot' | 'ideographic' | 'paren' | 'square' | 'round'

interface MatchedOptionLine extends ParsedOption {
  kind: OptionKind
  style: OptionStyle
}

interface OptionBlockCandidate {
  startLine: number
  endLine: number
  options: MatchedOptionLine[]
}

const EMPTY_PARSED_OPTIONS: ParsedOptions = {
  hasOptions: false,
  question: '',
  options: [],
  suffix: ''
}

const CHOICE_CUE_RE =
  /(?:请选择|请选|选项|选择|你想|你要|决定|怎么办|下一步|接下来|如何行动|你的决定|pick|choose|select|option|options|your choice|what do you do)/i

function trimOuterBlankLines(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift()
  }

  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop()
  }

  return lines.join('\n')
}

function getLastNonEmptyLine(text: string): string {
  const lines = text.split('\n')

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (line) {
      return line
    }
  }

  return ''
}

function isFenceMarker(line: string): boolean {
  return /^(```|~~~)/.test(line.trimStart())
}

function parseOptionLine(line: string): MatchedOptionLine | null {
  const squareMatch = line.match(/^\s*\[([A-Za-z]|\d+)\]\s+(.+?)\s*$/)
  if (squareMatch) {
    return buildMatchedOption(squareMatch[1], squareMatch[2], 'square')
  }

  const roundMatch = line.match(/^\s*\(([A-Za-z]|\d+)\)\s+(.+?)\s*$/)
  if (roundMatch) {
    return buildMatchedOption(roundMatch[1], roundMatch[2], 'round')
  }

  const punctMatch = line.match(/^\s*([A-Za-z]|\d+)([.)、])\s+(.+?)\s*$/)
  if (!punctMatch) {
    return null
  }

  const marker = punctMatch[2]
  const style: OptionStyle = marker === '.' ? 'dot' : marker === '、' ? 'ideographic' : 'paren'

  return buildMatchedOption(punctMatch[1], punctMatch[3], style)
}

function stripWrappedBackticks(label: string): string {
  const trimmedLabel = label.trim()
  const wrappedMatch = trimmedLabel.match(/^(`+)([\s\S]*?)\1$/)

  if (!wrappedMatch) {
    return trimmedLabel
  }

  return wrappedMatch[2].trim()
}

function buildMatchedOption(
  rawId: string,
  label: string,
  style: OptionStyle
): MatchedOptionLine | null {
  const trimmedLabel = stripWrappedBackticks(label)
  if (!trimmedLabel) {
    return null
  }

  if (/^[A-Za-z]$/.test(rawId)) {
    const id = rawId.toUpperCase()
    return {
      id,
      label: trimmedLabel,
      fullText: buildFullText(id, trimmedLabel, style),
      kind: 'alpha',
      style
    }
  }

  if (!/^\d+$/.test(rawId)) {
    return null
  }

  const numericId = Number.parseInt(rawId, 10)
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null
  }

  const id = String(numericId)
  return {
    id,
    label: trimmedLabel,
    fullText: buildFullText(id, trimmedLabel, style),
    kind: 'numeric',
    style
  }
}

function buildFullText(id: string, label: string, style: OptionStyle): string {
  switch (style) {
    case 'square':
      return `[${id}] ${label}`
    case 'round':
      return `(${id}) ${label}`
    case 'ideographic':
      return `${id}、${label}`
    case 'paren':
      return `${id}) ${label}`
    case 'dot':
    default:
      return `${id}. ${label}`
  }
}

function isSequentialOption(previous: MatchedOptionLine, current: MatchedOptionLine): boolean {
  if (previous.kind !== current.kind || previous.style !== current.style) {
    return false
  }

  if (previous.kind === 'alpha') {
    return current.id.charCodeAt(0) === previous.id.charCodeAt(0) + 1
  }

  return Number(current.id) === Number(previous.id) + 1
}

function isQuestionLikeLead(question: string, startLine: number): boolean {
  if (!question) {
    return startLine === 0
  }

  if (CHOICE_CUE_RE.test(question)) {
    return true
  }

  const lastLine = getLastNonEmptyLine(question)
  return /[：:？?]$/.test(lastLine)
}

function shouldUseCandidate(
  candidate: OptionBlockCandidate,
  question: string,
  suffix: string
): boolean {
  const firstOption = candidate.options[0]
  const hasQuestionLead = isQuestionLikeLead(question, candidate.startLine)
  const isExplicitStyle =
    firstOption.kind === 'alpha' || firstOption.style === 'square' || firstOption.style === 'round'

  // 只有在前文明确是提问/选择语境时，才接受后面仍有补充正文的情况，降低误判普通列表的概率。
  if (suffix) {
    return hasQuestionLead && isExplicitStyle
  }

  if (isExplicitStyle) {
    return true
  }

  if (!question) {
    return candidate.options.length <= 4
  }

  return hasQuestionLead && candidate.options.length <= 4
}

function findCandidateBlocks(lines: string[]): OptionBlockCandidate[] {
  const candidates: OptionBlockCandidate[] = []
  const parsedLines: Array<MatchedOptionLine | null> = []
  let inFence = false

  for (const line of lines) {
    if (isFenceMarker(line)) {
      inFence = !inFence
      parsedLines.push(null)
      continue
    }

    parsedLines.push(inFence ? null : parseOptionLine(line))
  }

  let lineIndex = 0

  while (lineIndex < parsedLines.length) {
    const current = parsedLines[lineIndex]

    if (!current) {
      lineIndex += 1
      continue
    }

    const options = [current]
    let endLine = lineIndex

    while (endLine + 1 < parsedLines.length) {
      const next = parsedLines[endLine + 1]
      if (!next || !isSequentialOption(options[options.length - 1], next)) {
        break
      }

      options.push(next)
      endLine += 1
    }

    if (options.length >= 2) {
      candidates.push({
        startLine: lineIndex,
        endLine,
        options
      })
    }

    lineIndex = endLine + 1
  }

  return candidates
}

export function parseMessageOptions(content: string): ParsedOptions {
  const normalizedContent = content.replace(/\r\n?/g, '\n')
  const lines = normalizedContent.split('\n')
  const candidates = findCandidateBlocks(lines)

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]
    const question = trimOuterBlankLines(lines.slice(0, candidate.startLine).join('\n'))
    const suffix = trimOuterBlankLines(lines.slice(candidate.endLine + 1).join('\n'))

    if (!shouldUseCandidate(candidate, question, suffix)) {
      continue
    }

    return {
      hasOptions: true,
      question,
      options: candidate.options.map(({ id, label, fullText }) => ({
        id,
        label,
        fullText
      })),
      suffix
    }
  }

  return EMPTY_PARSED_OPTIONS
}
