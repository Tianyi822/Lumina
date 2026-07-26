import type { WriterAiContextBlock, WriterAiRequestContext, WriterAiScope } from '@shared/types/writer'

/** 估算上下文字符上限（粗略 token 预算，约 8k token ≈ 24k 字符） */
export const WRITER_CONTEXT_CHAR_BUDGET = 24000

/**
 * 将写作请求上下文格式化为只读 system 消息
 * 声明标题只读、范围不可扩大，并要求通过 writer__propose_edits 产出修改建议
 */
export class WriterContextFormatter {
  static format(context: WriterAiRequestContext): string {
    const { title, anchor, blocks } = context
    const scopeLabel = formatScopeLabel(anchor.scope)
    const body =
      anchor.scope === 'document' ? formatDocumentBlocks(blocks) : formatScopedBlocks(blocks)

    return [
      '## 写作文档只读上下文',
      '',
      `文档标题（只读，不可修改标题）：${title}`,
      `文档 ID：${context.documentId}`,
      `baseRevision：${context.baseRevision}`,
      `编辑范围：${scopeLabel}（不得扩大范围）`,
      `锚点：${anchor.startBlockId}[${anchor.startOffset}] → ${anchor.endBlockId}[${anchor.endOffset}]`,
      `范围文本哈希：${anchor.expectedTextHash}`,
      '',
      '约束：',
      '- 标题为只读元数据，禁止通过任何方式修改标题。',
      '- 只能在下方给出的块范围内提出编辑建议，不可扩大范围。',
      '- 不能创建、删除或移动图片，也不能改变表格结构。',
      '- 必须调用 writer__propose_edits 才能产生修改建议；禁止直接声称已保存或已改文档。',
      '',
      '## 范围内块',
      body
    ].join('\n')
  }

  /**
   * 在请求构造阶段检查上下文是否超出字符预算
   * @returns 超限时返回错误信息，否则返回 null
   */
  static checkTokenBudget(context: WriterAiRequestContext): string | null {
    const formatted = this.format(context)
    if (formatted.length > WRITER_CONTEXT_CHAR_BUDGET) {
      return `写作上下文过长（${formatted.length} 字符，上限 ${WRITER_CONTEXT_CHAR_BUDGET}），请缩小编辑范围`
    }
    return null
  }
}

function formatScopeLabel(scope: WriterAiScope): string {
  switch (scope) {
    case 'cursor':
      return '光标附近（cursor）'
    case 'selection':
      return '选区（selection）'
    case 'section':
      return '当前章节（section）'
    case 'document':
      return '全文（document）'
  }
}

function formatScopedBlocks(blocks: WriterAiContextBlock[]): string {
  return blocks.map(formatBlockLine).join('\n')
}

/** document 范围按 heading 分组 */
function formatDocumentBlocks(blocks: WriterAiContextBlock[]): string {
  const sections: Array<{ title: string; lines: string[] }> = []
  let current = { title: '前言', lines: [] as string[] }

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (current.lines.length > 0 || sections.length === 0) {
        sections.push(current)
      } else if (sections.length > 0 && current.lines.length === 0 && current.title === '前言') {
        // 文档以 heading 开头时丢弃空前言
      } else {
        sections.push(current)
      }
      current = { title: block.text || '未命名章节', lines: [formatBlockLine(block)] }
      continue
    }
    current.lines.push(formatBlockLine(block))
  }
  sections.push(current)

  return sections
    .filter((section) => section.lines.length > 0 || section.title !== '前言')
    .map((section) => `## ${section.title}\n${section.lines.join('\n')}`)
    .join('\n\n')
}

function formatBlockLine(block: WriterAiContextBlock): string {
  const level = block.level != null ? ` level=${block.level}` : ''
  return `- [${block.nodeId}] (${block.type}${level}) ${block.text}`
}
