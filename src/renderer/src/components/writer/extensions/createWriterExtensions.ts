import type { AnyExtension as Extension } from '@tiptap/core'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Mathematics } from '@tiptap/extension-mathematics'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import UniqueID from '@tiptap/extension-unique-id'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { WriterClipboard } from './writerClipboard'
import { WriterMarkdownRules } from './writerMarkdownRules'

const lowlight = createLowlight(common)

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
  'blockMath'
]

export function createWriterExtensions(): Extension[] {
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
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
        strict: false
      }
    }),
    TableKit.configure({
      table: {
        resizable: true,
        allowTableNodeSelection: true
      }
    }),
    Image.configure({ allowBase64: true }),
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
