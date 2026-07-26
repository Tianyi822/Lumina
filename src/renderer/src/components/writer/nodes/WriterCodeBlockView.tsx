import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { ChangeEvent } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { normalizeWriterCodeLanguage, WRITER_CODE_LANGUAGES } from '../extensions/writerMath'
import styles from './WriterCodeBlockView.module.css'

const LANGUAGE_LABELS: Record<(typeof WRITER_CODE_LANGUAGES)[number], string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  json: 'JSON',
  bash: 'Bash',
  css: 'CSS',
  xml: 'XML',
  markdown: 'Markdown',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  rust: 'Rust',
  go: 'Go'
}

/** 代码节点只用于编辑和着色，绝不执行其文本内容。 */
export default function WriterCodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = normalizeWriterCodeLanguage(node.attrs.language)

  const copyCode = (): void => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(node.textContent).catch(() => undefined)
  }

  const changeLanguage = (event: ChangeEvent<HTMLSelectElement>): void => {
    updateAttributes({ language: normalizeWriterCodeLanguage(event.target.value) })
  }

  return (
    <NodeViewWrapper className={styles.codeBlock} data-language={language ?? undefined}>
      <div className={styles.toolbar} contentEditable={false}>
        <label className={styles.languageLabel}>
          代码语言
          <select
            className={styles.languageSelect}
            aria-label="代码语言"
            value={language ?? ''}
            onChange={changeLanguage}
          >
            <option value="">纯文本</option>
            {WRITER_CODE_LANGUAGES.map((item) => (
              <option key={item} value={item}>
                {LANGUAGE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.copyButton} aria-label="复制代码" onClick={copyCode}>
          复制
        </button>
      </div>
      <pre className={styles.codeSurface}>
        <NodeViewContent<'code'> as="code" className={styles.codeContent} />
      </pre>
    </NodeViewWrapper>
  )
}
