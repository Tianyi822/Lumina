import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import 'katex/dist/katex.min.css'
import { renderWriterMath } from '../extensions/writerMath'
import styles from './WriterMathView.module.css'

function getLatex(node: NodeViewProps['node']): string {
  return typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
}

/** 公式节点只保存 LaTeX；预览 HTML 始终由当前源码重新计算。 */
export default function WriterMathView({ node, updateAttributes }: NodeViewProps) {
  const latex = getLatex(node)
  const displayMode = node.type.name === 'blockMath'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(latex)
  const renderResult = useMemo(
    () => renderWriterMath(editing ? draft : latex, displayMode),
    [displayMode, draft, editing, latex]
  )

  const copyLatex = (): void => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(editing ? draft : latex).catch(() => undefined)
  }

  const openEditor = (event: MouseEvent<HTMLElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    setDraft(latex)
    setEditing(true)
  }

  const cancelEditor = (): void => {
    setDraft(latex)
    setEditing(false)
  }

  const confirmEditor = (): void => {
    updateAttributes({ latex: draft })
    setEditing(false)
  }

  return (
    <NodeViewWrapper
      as={displayMode ? 'div' : 'span'}
      className={displayMode ? styles.blockMath : styles.inlineMath}
      data-type={displayMode ? 'block-math' : 'inline-math'}
      data-latex={latex}
      aria-label={latex}
      contentEditable={false}
      onDoubleClick={openEditor}
    >
      <span className={styles.rendered} aria-label={latex}>
        {renderResult.success ? (
          <span dangerouslySetInnerHTML={{ __html: renderResult.html }} />
        ) : (
          <span className={styles.renderError} role="alert">
            {latex || '空公式'}：{renderResult.error}
          </span>
        )}
      </span>
      <button type="button" className={styles.copyButton} aria-label="复制公式源码" onClick={copyLatex}>
        复制源码
      </button>
      {editing ? (
        <div className={styles.editorPopover} role="dialog" aria-label="编辑公式源码">
          <label className={styles.editorLabel}>
            LaTeX 源码
            <textarea
              className={styles.sourceInput}
              aria-label="LaTeX 源码"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
          </label>
          <div className={styles.preview} aria-label="公式实时预览">
            {renderResult.success ? (
              <span dangerouslySetInnerHTML={{ __html: renderResult.html }} />
            ) : (
              <span className={styles.renderError} role="alert">
                {renderResult.error}
              </span>
            )}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.actionButton} onClick={confirmEditor}>
              确定
            </button>
            <button type="button" className={styles.actionButton} onClick={cancelEditor}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}
