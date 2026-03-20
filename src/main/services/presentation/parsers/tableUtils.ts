export interface ParsedMarkdownTableBlock {
  headers: string[]
  rows: string[][]
  nextIndex: number
}

function normalizeMarkdownTableLine(line: string): string {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed
}

export function splitMarkdownTableRow(
  line: string,
  sanitize: (text: string) => string
): string[] | null {
  const normalized = normalizeMarkdownTableLine(line)
  if (!normalized.includes('|')) {
    return null
  }

  const cells = normalized.split('|').map((cell) => sanitize(cell.trim()))
  return cells.length >= 2 ? cells : null
}

export function getMarkdownTableDelimiterColumnCount(line: string): number | null {
  const normalized = normalizeMarkdownTableLine(line)
  if (!normalized.includes('|')) {
    return null
  }

  const cells = normalized.split('|').map((cell) => cell.trim())
  if (cells.length < 2) {
    return null
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell)) ? cells.length : null
}

export function isMarkdownTableStart(
  lines: string[],
  startIndex: number,
  sanitize: (text: string) => string
): boolean {
  const headers = splitMarkdownTableRow(lines[startIndex] ?? '', sanitize)
  if (!headers) {
    return false
  }

  return getMarkdownTableDelimiterColumnCount(lines[startIndex + 1] ?? '') === headers.length
}

export function parseMarkdownTableBlock(
  lines: string[],
  startIndex: number,
  sanitize: (text: string) => string
): ParsedMarkdownTableBlock | null {
  if (!isMarkdownTableStart(lines, startIndex, sanitize)) {
    return null
  }

  const headers = splitMarkdownTableRow(lines[startIndex], sanitize)
  if (!headers) {
    return null
  }

  const rows: string[][] = []
  let index = startIndex + 2

  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (!trimmed) {
      index += 1
      break
    }

    if (getMarkdownTableDelimiterColumnCount(trimmed) !== null) {
      break
    }

    const row = splitMarkdownTableRow(trimmed, sanitize)
    if (!row || row.length !== headers.length) {
      break
    }

    rows.push(row)
    index += 1
  }

  return { headers, rows, nextIndex: index }
}
