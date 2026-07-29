import type { AnyExtension as Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import UniqueID from '@tiptap/extension-unique-id'
import StarterKit from '@tiptap/starter-kit'
import { ReactNodeViewRenderer } from '@tiptap/react'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { createLowlight } from 'lowlight'
import WriterCodeBlockView from '../nodes/WriterCodeBlockView.tsx'
import WriterMathView from '../nodes/WriterMathView.tsx'
import { WriterClipboard } from './writerClipboard'
import {
  WriterFootnoteDefinition,
  WriterFootnoteInteractions,
  WriterFootnoteReference
} from './writerFootnotes'
import { createWriterImageExtension } from './writerImage'
import { WriterMarkdownRules } from './writerMarkdownRules'
import {
  normalizeWriterCodeBlockAttributes,
  normalizeWriterCodeBlockContent,
  normalizeWriterCodeLanguage
} from './writerMath'
import { WriterTable, WriterTableCell, WriterTableHeader, WriterTableRow } from './writerTable'

function normalizeCodeBlockLanguages(state: EditorState): Transaction | null {
  const transaction = state.tr
  state.doc.descendants((node, position) => {
    if (node.type.name !== 'codeBlock') return
    const attributes = normalizeWriterCodeBlockAttributes(
      node.attrs as unknown as { language: unknown }
    )
    if (node.attrs.language === attributes.language) return
    transaction.setNodeMarkup(position, undefined, { ...node.attrs, language: attributes.language })
  })
  return transaction.docChanged ? transaction : null
}

const lowlight = createLowlight({
  javascript,
  typescript,
  python,
  json,
  bash,
  css,
  xml,
  markdown,
  c,
  cpp,
  java,
  rust,
  go
})

const WriterCodeBlock = CodeBlockLowlight.extend({
  onBeforeCreate({ editor }) {
    editor.options.content = normalizeWriterCodeBlockContent(
      editor.options.content
    ) as typeof editor.options.content
  },

  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.setNode(this.name, {
            language: normalizeWriterCodeLanguage(attributes?.language)
          }),
      toggleCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph', {
            language: normalizeWriterCodeLanguage(attributes?.language)
          })
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(WriterCodeBlockView)
  },

  onCreate() {
    const transaction = normalizeCodeBlockLanguages(this.editor.state)
    if (!transaction) return
    transaction.setMeta('addToHistory', false)
    this.editor.view.dispatch(transaction)
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return
          const transaction = normalizeCodeBlockLanguages(newState)
          if (!transaction) return
          transaction.setMeta('addToHistory', false)
          return transaction
        }
      })
    ]
  }
})

const WriterInlineMath = InlineMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(WriterMathView)
  }
})

const WriterBlockMath = BlockMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(WriterMathView)
  }
})

const STABLE_WRITER_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'horizontalRule',
  'image',
  'table',
  'tableCell',
  'tableHeader',
  'inlineMath',
  'blockMath',
  'footnoteDefinition'
]

export function createWriterExtensions(documentId = 'writer-unbound'): Extension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
      underline: false
    }),
    Underline,
    Highlight.configure({ multicolor: false }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ['https', 'http', 'mailto']
    }),
    WriterCodeBlock.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    WriterInlineMath,
    WriterBlockMath,
    WriterTable.configure({
      resizable: true,
      allowTableNodeSelection: true
    }),
    WriterTableRow,
    WriterTableCell,
    WriterTableHeader,
    WriterFootnoteReference,
    WriterFootnoteDefinition,
    WriterFootnoteInteractions,
    createWriterImageExtension({ documentId }),
    TextAlign.configure({
      types: ['heading', 'paragraph', 'tableCell'],
      alignments: ['left', 'center', 'right', 'justify']
    }),
    Placeholder.configure({ placeholder: '开始写作…' }),
    CharacterCount,
    WriterMarkdownRules,
    WriterClipboard,
    UniqueID.configure({
      attributeName: 'nodeId',
      types: STABLE_WRITER_NODE_TYPES
    })
  ]
}
