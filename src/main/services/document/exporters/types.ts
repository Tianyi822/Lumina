/**
 * Word 文本运行样式
 */
export interface WordRunStyle {
  bold?: boolean
  italic?: boolean
  color?: string
  fontSize?: number
  monospace?: boolean
}

/**
 * Word 文本片段
 */
export interface WordTextFragment {
  text: string
  useEmojiFont?: boolean
}

/**
 * Word 段落选项
 */
export interface WordParagraphOptions {
  indentLeft?: number
  indentHanging?: number
  spacingBefore?: number
  spacingAfter?: number
  shadeFill?: string
  borderLeftColor?: string
  runStyle?: WordRunStyle
}
