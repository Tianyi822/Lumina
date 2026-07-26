import { useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import styles from './WriterToolbar.module.css'
import type { WriterBubbleAiAction } from './writerBubbleAiActions'

interface WriterBubbleMenuProps {
  editor: Editor
  isAiSending?: boolean
  onAiAction?: (action: WriterBubbleAiAction) => void
}

interface MarkAction {
  name: string
  label: string
  isActive: () => boolean
  run: () => void
}

function normalizeLink(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export default function WriterBubbleMenu({
  editor,
  isAiSending,
  onAiAction
}: WriterBubbleMenuProps) {
  const [editingLink, setEditingLink] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [linkInvalid, setLinkInvalid] = useState(false)

  const preventFocusLoss = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }

  const actions: MarkAction[] = [
    {
      name: 'bold',
      label: '粗体',
      isActive: () => editor.isActive('bold'),
      run: () => {
        editor.chain().focus().toggleBold().run()
      }
    },
    {
      name: 'italic',
      label: '斜体',
      isActive: () => editor.isActive('italic'),
      run: () => {
        editor.chain().focus().toggleItalic().run()
      }
    },
    {
      name: 'underline',
      label: '下划线',
      isActive: () => editor.isActive('underline'),
      run: () => {
        editor.chain().focus().toggleUnderline().run()
      }
    },
    {
      name: 'strike',
      label: '删除线',
      isActive: () => editor.isActive('strike'),
      run: () => {
        editor.chain().focus().toggleStrike().run()
      }
    },
    {
      name: 'highlight',
      label: '语义高亮',
      isActive: () => editor.isActive('highlight'),
      run: () => {
        editor.chain().focus().toggleHighlight().run()
      }
    },
    {
      name: 'code',
      label: '行内代码',
      isActive: () => editor.isActive('code'),
      run: () => {
        editor.chain().focus().toggleCode().run()
      }
    }
  ]

  const openLinkEditor = (): void => {
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    setLinkValue('')
    setLinkInvalid(false)
    setEditingLink(true)
  }

  const applyLink = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const href = normalizeLink(linkValue)
    if (!href) {
      setLinkInvalid(true)
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setEditingLink(false)
    setLinkInvalid(false)
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="writerBubbleMenu"
      shouldShow={({ editor: currentEditor, from, to }) => currentEditor.isEditable && from !== to}
      options={{ placement: 'top', offset: 8 }}
      className={styles.bubbleMenu}
      role="toolbar"
      aria-label="文字格式与 AI 动作"
    >
      {actions.map((action) => (
        <button
          key={action.name}
          type="button"
          className={styles.toolbarButton}
          aria-label={action.label}
          aria-pressed={action.isActive()}
          data-active={action.isActive() || undefined}
          onMouseDown={preventFocusLoss}
          onClick={action.run}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label={editor.isActive('link') ? '移除链接' : '添加链接'}
        aria-pressed={editor.isActive('link')}
        data-active={editor.isActive('link') || undefined}
        onMouseDown={preventFocusLoss}
        onClick={openLinkEditor}
      >
        链接
      </button>
      {onAiAction ? (
        <>
          <span className={styles.bubbleAiDivider} role="separator" aria-hidden="true" />
          <button
            type="button"
            className={styles.toolbarButton}
            aria-label="AI 改写选区"
            aria-busy={isAiSending || undefined}
            disabled={Boolean(isAiSending)}
            onMouseDown={preventFocusLoss}
            onClick={() => onAiAction('rewrite')}
          >
            改写
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            aria-label="AI 续写选区"
            aria-busy={isAiSending || undefined}
            disabled={Boolean(isAiSending)}
            onMouseDown={preventFocusLoss}
            onClick={() => onAiAction('continue')}
          >
            续写
          </button>
        </>
      ) : null}
      {editingLink ? (
        <form className={styles.linkForm} onSubmit={applyLink}>
          <label className={styles.srOnly} htmlFor="writer-link-input">
            链接地址
          </label>
          <input
            id="writer-link-input"
            className={styles.linkInput}
            type="text"
            inputMode="url"
            autoFocus
            value={linkValue}
            aria-invalid={linkInvalid}
            placeholder="https://"
            onChange={(event) => {
              setLinkValue(event.target.value)
              setLinkInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setEditingLink(false)
                editor.commands.focus()
              }
            }}
          />
          <button className={styles.linkSubmit} type="submit">
            应用
          </button>
        </form>
      ) : null}
    </BubbleMenu>
  )
}
