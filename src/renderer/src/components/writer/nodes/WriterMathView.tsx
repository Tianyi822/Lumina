import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MouseEvent } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import 'katex/dist/katex.min.css'
import {
  openWriterMathDraft,
  reconcileWriterMathDraft,
  renderWriterMath
} from '../extensions/writerMath'
import styles from './WriterMathView.module.css'

function getLatex(node: NodeViewProps['node']): string {
  return typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
}

/** 公式节点只保存 LaTeX；预览 HTML 始终由当前源码重新计算。 */
export default function WriterMathView({ node, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation()
  const latex = getLatex(node)
  const displayMode = node.type.name === 'blockMath'
  const [draftState, setDraftState] = useState(() => ({
    editing: false,
    draft: latex,
    sourceLatex: latex
  }))
  const currentDraft = reconcileWriterMathDraft(draftState, latex)
  const { editing, draft } = currentDraft

  useEffect(() => {
    if (currentDraft !== draftState) setDraftState(currentDraft)
  }, [currentDraft, draftState])

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
    setDraftState((current) => openWriterMathDraft(current, latex))
  }

  const cancelEditor = (): void => {
    setDraftState({ editing: false, draft: latex, sourceLatex: latex })
  }

  const confirmEditor = (): void => {
    updateAttributes({ latex: draft })
    setDraftState((current) => ({ ...current, editing: false }))
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
            {latex || t('writer.nodes.emptyFormula')}：{renderResult.error}
          </span>
        )}
      </span>
      <button
        type="button"
        className={styles.copyButton}
        aria-label={t('writer.nodes.copyFormulaSource')}
        onClick={copyLatex}
      >
        {t('writer.nodes.copySource')}
      </button>
      {editing ? (
        <div
          className={styles.editorPopover}
          role="dialog"
          aria-label={t('writer.nodes.editFormulaSource')}
        >
          <label className={styles.editorLabel}>
            {t('writer.nodes.latexSource')}
            <textarea
              className={styles.sourceInput}
              aria-label={t('writer.nodes.latexSource')}
              value={draft}
              onChange={(event) =>
                setDraftState((current) => ({ ...current, draft: event.target.value }))
              }
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          </label>
          <div className={styles.preview} aria-label={t('writer.nodes.formulaPreview')}>
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
              {t('common.ok')}
            </button>
            <button type="button" className={styles.actionButton} onClick={cancelEditor}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}
