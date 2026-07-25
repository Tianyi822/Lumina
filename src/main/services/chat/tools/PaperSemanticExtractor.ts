import type { PaperSemanticContext } from './PipelineTypes'

/** 英文停用词集合 */
const EN_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'because', 'if', 'when', 'where', 'how', 'what', 'which', 'who',
  'that', 'this', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
  'we', 'you', 'i', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'our', 'their', 'based', 'using', 'via', 'also', 'new', 'one',
  'two', 'first', 'second', 'many', 'well', 'about', 'up'
])

// 中文虚词/连接词/代词等无实义字符，用于过滤 n-gram 噪声
const ZH_STOP_CHARS = new Set([
  '的', '了', '在', '与', '和', '对', '等', '为', '被', '把', '让', '给',
  '用', '以', '及', '或', '但', '而', '且', '则', '于', '从', '到', '由',
  '之', '其', '着', '过', '得', '地', '是', '有', '将', '可', '能', '所',
  '该', '各', '本', '这', '那', '此', '个', '中', '上', '下', '里', '间',
])

/**
 * 论文语义提取器
 * 从论文标题中提取关键词，用于增强知识库搜索的语义相关性
 */
export class PaperSemanticExtractor {
  /**
   * 从论文标题中提取关键词
   * 英文单词过滤停用词后保留，中文文本按虚词分段后生成 2-4 字 n-gram
   * @param title 论文标题
   * @returns 去重后的关键词列表
   */
  extractKeywords(title: string): string[] {
    if (!title) return []

    const keywords: string[] = []

    // 英文：提取单词，过滤停用词
    const englishWords = title.match(/[a-zA-Z]+/g) ?? []
    for (const word of englishWords) {
      if (!EN_STOP_WORDS.has(word.toLowerCase())) {
        keywords.push(word)
      }
    }

    // 中文：移除非中文字符后，按虚词分段，对每段生成 2-4 字 n-gram
    const chineseChars = title.replace(/[a-zA-Z0-9\s\-_,.!?;:'"()]/g, '')
    if (chineseChars.length >= 2) {
      // 按虚词将中文字符串切分成有意义的片段
      const segments = this.splitChineseByStopWords(chineseChars)
      for (const seg of segments) {
        if (seg.length < 2) continue
        for (let len = 2; len <= Math.min(4, seg.length); len++) {
          for (let i = 0; i <= seg.length - len; i++) {
            keywords.push(seg.substring(i, i + len))
          }
        }
      }
    }

    return [...new Set(keywords)]
  }

  /**
   * 从论文对象中提取完整的语义上下文
   * @param paperId 论文 ID
   * @param paper 论文对象（可能为 null）
   * @returns 论文语义上下文
   */
  async extract(
    paperId: string,
    paper: { title?: string; abstract?: string } | null
  ): Promise<PaperSemanticContext> {
    if (!paper) {
      return { paperId, title: '', keywords: [] }
    }

    const title = paper.title ?? ''
    return {
      paperId,
      title,
      keywords: this.extractKeywords(title),
      abstract: paper.abstract
    }
  }

  /**
   * 按中文虚词切分字符串，得到有意义的片段
   * 过滤掉单字符残留，仅保留长度 >= 2 的片段
   */
  private splitChineseByStopWords(text: string): string[] {
    const segments: string[] = []
    let current = ''

    for (const char of text) {
      if (ZH_STOP_CHARS.has(char)) {
        if (current.length >= 2) segments.push(current)
        current = ''
      } else {
        current += char
      }
    }
    if (current.length >= 2) segments.push(current)

    return segments
  }
}
