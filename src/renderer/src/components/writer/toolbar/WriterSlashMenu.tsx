import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import type { Editor } from '@tiptap/core'
import styles from './WriterToolbar.module.css'

interface WriterSlashMenuProps {
  editor: Editor
}

interface SlashMenuState {
  from: number
  to: number
  query: string
  top: number
  left: number
}

interface SlashMenuItem {
  id: string
  label: string
  keywords: string
  run: (editor: Editor) => void
}

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    id: 'paragraph',
    label: '正文',
    keywords: 'paragraph text',
    run: (editor) => {
      editor.chain().focus().setParagraph().run()
    }
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    id: `heading-${level}`,
    label: `${level} 级标题`,
    keywords: `heading h${level} 标题`,
    run: (editor: Editor) => {
      editor.chain().focus().setHeading({ level }).run()
    }
  })),
  {
    id: 'bullet-list',
    label: '无序列表',
    keywords: 'bullet list',
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run()
    }
  },
  {
    id: 'ordered-list',
    label: '有序列表',
    keywords: 'ordered number list',
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run()
    }
  },
  {
    id: 'task-list',
    label: '任务列表',
    keywords: 'task todo checklist',
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run()
    }
  },
  {
    id: 'blockquote',
    label: '引用',
    keywords: 'quote blockquote',
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run()
    }
  },
  {
    id: 'code-block',
    label: '代码块',
    keywords: 'code fence',
    run: (editor) => {
      editor.chain().focus().setCodeBlock().run()
    }
  },
  {
    id: 'horizontal-rule',
    label: '分隔线',
    keywords: 'divider horizontal rule',
    run: (editor) => {
      editor.chain().focus().setHorizontalRule().run()
    }
  },
  {
    id: 'table',
    label: '表格',
    keywords: 'table',
    run: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }
  }
]

function readSlashMenuState(editor: Editor): SlashMenuState | null {
  const { selection } = editor.state
  if (!selection.empty || !selection.$from.parent.isTextblock) return null
  if (selection.$from.parent.type.name === 'codeBlock') return null

  const textBeforeCursor = selection.$from.parent.textBetween(
    0,
    selection.$from.parentOffset,
    '\n',
    '\0'
  )
  const match = textBeforeCursor.match(/^\/([^\s/]*)$/)
  if (!match) return null

  const coordinates = editor.view.coordsAtPos(selection.from)
  return {
    from: selection.$from.start(),
    to: selection.from,
    query: match[1].toLowerCase(),
    top: coordinates.bottom,
    left: coordinates.left
  }
}

export default function WriterSlashMenu({ editor }: WriterSlashMenuProps) {
  const [menuState, setMenuState] = useState<SlashMenuState | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuStateRef = useRef<SlashMenuState | null>(null)
  const selectedIndexRef = useRef(0)

  const items = menuState
    ? SLASH_MENU_ITEMS.filter((item) =>
        `${item.label} ${item.keywords}`.toLowerCase().includes(menuState.query)
      )
    : []
  const itemsRef = useRef(items)
  itemsRef.current = items

  const syncMenuState = useCallback(() => {
    const nextState = readSlashMenuState(editor)
    menuStateRef.current = nextState
    setMenuState(nextState)
    selectedIndexRef.current = 0
    setSelectedIndex(0)
  }, [editor])

  const closeAndFocus = useCallback(() => {
    menuStateRef.current = null
    setMenuState(null)
    editor.commands.focus()
  }, [editor])

  const selectItem = useCallback(
    (item: SlashMenuItem) => {
      const currentState = menuStateRef.current
      if (!currentState) return
      editor.chain().focus().deleteRange({ from: currentState.from, to: currentState.to }).run()
      item.run(editor)
      menuStateRef.current = null
      setMenuState(null)
    },
    [editor]
  )

  useEffect(() => {
    editor.on('transaction', syncMenuState)
    syncMenuState()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!menuStateRef.current) return
      const currentItems = itemsRef.current

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeAndFocus()
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        if (currentItems.length === 0) return
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex =
          (selectedIndexRef.current + direction + currentItems.length) % currentItems.length
        selectedIndexRef.current = nextIndex
        setSelectedIndex(nextIndex)
      } else if (event.key === 'Enter' && currentItems.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        selectItem(currentItems[selectedIndexRef.current] ?? currentItems[0])
      }
    }

    editor.view.dom.addEventListener('keydown', handleKeyDown)
    return () => {
      editor.off('transaction', syncMenuState)
      editor.view.dom.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeAndFocus, editor, selectItem, syncMenuState])

  if (!menuState) return null

  const position = {
    '--writer-slash-menu-top': `${menuState.top}px`,
    '--writer-slash-menu-left': `${menuState.left}px`
  } as CSSProperties

  return (
    <div
      className={styles.slashMenu}
      style={position}
      role="listbox"
      aria-label="插入内容"
      aria-activedescendant={
        items[selectedIndex] ? `writer-slash-${items[selectedIndex].id}` : undefined
      }
    >
      {items.length > 0 ? (
        items.map((item, index) => (
          <button
            id={`writer-slash-${item.id}`}
            key={item.id}
            type="button"
            className={styles.slashItem}
            role="option"
            aria-selected={index === selectedIndex}
            data-active={index === selectedIndex || undefined}
            onMouseEnter={() => {
              selectedIndexRef.current = index
              setSelectedIndex(index)
            }}
            onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault()
              selectItem(item)
            }}
          >
            {item.label}
          </button>
        ))
      ) : (
        <div className={styles.emptyState}>没有匹配的块</div>
      )}
    </div>
  )
}
