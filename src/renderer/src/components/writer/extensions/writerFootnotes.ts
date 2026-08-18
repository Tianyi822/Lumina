import { Extension, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { WriterJsonDocument, WriterJsonNode } from '@shared/types/writer'
import { i18n } from '@renderer/i18n'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    writerFootnote: {
      /** 在光标处插入脚注引用，并在文档末尾追加共享同一 footnoteId 的空定义。 */
      insertFootnote: () => ReturnType
    }
  }
}

function collectFootnoteReferenceIds(node: WriterJsonNode, ids: string[]): void {
  const footnoteId = node.attrs?.footnoteId
  if (node.type === 'footnoteReference' && typeof footnoteId === 'string') {
    ids.push(footnoteId)
  }
  for (const child of node.content ?? []) {
    collectFootnoteReferenceIds(child, ids)
  }
}

/** 脚注编号只按引用在正文中首次出现的顺序派生，从不写回 JSON。 */
export function deriveFootnoteNumbers(document: WriterJsonDocument): Map<string, number> {
  const ids: string[] = []
  collectFootnoteReferenceIds(document, ids)

  const numbers = new Map<string, number>()
  let nextNumber = 1
  for (const id of ids) {
    if (!numbers.has(id)) {
      numbers.set(id, nextNumber)
      nextNumber += 1
    }
  }
  return numbers
}

/** 引用次数用于判断脚注定义是否仍被引用，删除最后一个引用后定义旁会显示"未引用"。 */
export function deriveFootnoteReferenceCounts(document: WriterJsonDocument): Map<string, number> {
  const ids: string[] = []
  collectFootnoteReferenceIds(document, ids)

  const counts = new Map<string, number>()
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** 供 UI/测试判断某个脚注定义当前是否还有引用指向它。 */
export function isFootnoteReferenced(document: WriterJsonDocument, footnoteId: string): boolean {
  return (deriveFootnoteReferenceCounts(document).get(footnoteId) ?? 0) > 0
}

/**
 * 点击脚注定义时跳回"最近引用"：取定义之前最后一次出现的引用；
 * 若定义位置之前没有引用（例如引用被移动到定义之后），退回第一个引用。
 * 纯函数便于在没有真实 DOM/Editor 的环境下单独验证跳转策略。
 */
export function selectNearestFootnoteReference(
  referencePositions: number[],
  definitionPosition: number | undefined
): number | undefined {
  if (referencePositions.length === 0) return undefined
  if (definitionPosition === undefined) return referencePositions[0]

  const preceding = referencePositions.filter((position) => position <= definitionPosition)
  return preceding.length > 0 ? preceding[preceding.length - 1] : referencePositions[0]
}

function generateFootnoteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `footnote-${crypto.randomUUID()}`
  }
  return `footnote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 脚注引用：行内原子节点，只保存 footnoteId，编号通过装饰在展示层派生。 */
export const WriterFootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      footnoteId: { default: null }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote-id]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          const footnoteId = element.getAttribute('data-footnote-id')
          return footnoteId ? { footnoteId } : false
        }
      }
    ]
  },

  renderHTML({ node }) {
    return [
      'sup',
      {
        class: 'writer-footnote-ref',
        'data-footnote-id': node.attrs.footnoteId,
        'data-node-type': 'footnote-reference'
      }
    ]
  },

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ chain }) => {
          const footnoteId = generateFootnoteId()
          return chain()
            .insertContent({ type: this.name, attrs: { footnoteId } })
            .command(({ tr, dispatch }) => {
              if (!dispatch) return true
              const definitionType = tr.doc.type.schema.nodes.footnoteDefinition
              const definition = definitionType?.createAndFill({ footnoteId })
              if (!definition) return false
              tr.insert(tr.doc.content.size, definition)
              return true
            })
            .run()
        }
    }
  }
})

/** 脚注定义：块级节点，只包含段落内容；删除最后一个引用时仍然保留定义。 */
export const WriterFootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'paragraph+',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      footnoteId: { default: null }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-footnote-definition]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          const footnoteId = element.getAttribute('data-footnote-id')
          return footnoteId ? { footnoteId } : false
        }
      }
    ]
  },

  renderHTML({ node }) {
    return [
      'div',
      {
        class: 'writer-footnote-def',
        'data-footnote-definition': 'true',
        'data-footnote-id': node.attrs.footnoteId
      },
      0
    ]
  }
})

const writerFootnotePluginKey = new PluginKey<DecorationSet>('writerFootnoteNumbering')

function buildFootnoteDecorations(doc: PMNode): DecorationSet {
  const json = doc.toJSON() as WriterJsonDocument
  const numbers = deriveFootnoteNumbers(json)
  const counts = deriveFootnoteReferenceCounts(json)
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    const footnoteId = node.attrs.footnoteId
    if (typeof footnoteId !== 'string') return

    if (node.type.name === 'footnoteReference') {
      const number = numbers.get(footnoteId)
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          'data-number': number !== undefined ? String(number) : ''
        })
      )
      return
    }

    if (node.type.name === 'footnoteDefinition') {
      const number = numbers.get(footnoteId)
      const attrs: Record<string, string> = {
        'data-number': number !== undefined ? String(number) : ''
      }
      if ((counts.get(footnoteId) ?? 0) === 0) {
        attrs['data-unreferenced'] = 'true'
        // "未引用"标签创建期定型（与 placeholder 同惯例），不随语言切换追溯
        attrs['data-unreferenced-label'] = i18n.t('writer.editor.unreferencedLabel')
      }
      decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs))
    }
  })

  return DecorationSet.create(doc, decorations)
}

function findFootnoteNodePositions(doc: PMNode, typeName: string, footnoteId: string): number[] {
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && node.attrs.footnoteId === footnoteId) positions.push(pos)
  })
  return positions
}

function scrollToFootnotePosition(view: EditorView, pos: number): boolean {
  const domNode = view.nodeDOM(pos)
  const element =
    domNode instanceof HTMLElement ? domNode : view.domAtPos(pos + 1).node.parentElement
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}

function handleFootnoteClick(view: EditorView, event: MouseEvent): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false

  const referenceElement = target.closest('[data-node-type="footnote-reference"]')
  if (referenceElement) {
    const footnoteId = referenceElement.getAttribute('data-footnote-id')
    if (!footnoteId) return false
    const [definitionPos] = findFootnoteNodePositions(
      view.state.doc,
      'footnoteDefinition',
      footnoteId
    )
    if (definitionPos === undefined) return false
    return scrollToFootnotePosition(view, definitionPos)
  }

  const definitionElement = target.closest('[data-footnote-definition]')
  if (definitionElement) {
    const footnoteId = definitionElement.getAttribute('data-footnote-id')
    if (!footnoteId) return false
    const referencePositions = findFootnoteNodePositions(
      view.state.doc,
      'footnoteReference',
      footnoteId
    )
    const [definitionPos] = findFootnoteNodePositions(
      view.state.doc,
      'footnoteDefinition',
      footnoteId
    )
    const targetPos = selectNearestFootnoteReference(referencePositions, definitionPos)
    if (targetPos === undefined) return false
    return scrollToFootnotePosition(view, targetPos)
  }

  return false
}

/** 只负责编号装饰与双向跳转，不修改文档内容，因此编号永远不会被写回 JSON。 */
export const WriterFootnoteInteractions = Extension.create({
  name: 'writerFootnoteInteractions',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: writerFootnotePluginKey,
        state: {
          init: (_config, state) => buildFootnoteDecorations(state.doc),
          apply: (tr, decorations, _oldState, newState) =>
            tr.docChanged
              ? buildFootnoteDecorations(newState.doc)
              : decorations.map(tr.mapping, tr.doc)
        },
        props: {
          decorations: (state) => writerFootnotePluginKey.getState(state) ?? DecorationSet.empty,
          handleClick: (view, _pos, event) => handleFootnoteClick(view, event)
        }
      })
    ]
  }
})
