import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { WriterImageAlign } from '../extensions/writerImage'
import styles from './WriterImageView.module.css'

function readTextAttribute(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(10, value))
    : 100
}

function readAlign(value: unknown): WriterImageAlign {
  return value === 'left' || value === 'right' ? value : 'center'
}

/** 图片节点的编辑工具只在节点选中时出现，避免干扰正文输入。 */
export default function WriterImageView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode
}: NodeViewProps) {
  const src = readTextAttribute(node.attrs.src)
  const alt = readTextAttribute(node.attrs.alt)
  const caption = readTextAttribute(node.attrs.caption)
  const width = readWidth(node.attrs.width)
  const align = readAlign(node.attrs.align)
  const wrapperStyle = { '--writer-image-width': `${width}%` } as CSSProperties

  const stopPropagation = (event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation()
  }

  const selectImage = (): void => {
    const position = getPos()
    if (typeof position === 'number') {
      editor.commands.setNodeSelection(position)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectImage()
    } else if (selected && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      deleteNode()
    }
  }

  return (
    <NodeViewWrapper
      as="figure"
      className={styles.figure}
      data-align={align}
      data-selected={selected || undefined}
      style={wrapperStyle}
      contentEditable={false}
      tabIndex={0}
      role="group"
      aria-label={alt ? `图片：${alt}` : '图片：尚未填写替代文本'}
      onClick={selectImage}
      onKeyDown={handleKeyDown}
    >
      <img className={styles.image} src={src} alt={alt} draggable={false} />
      {selected ? (
        <div
          className={styles.toolbar}
          role="toolbar"
          aria-label="图片工具"
          onClick={stopPropagation}
        >
          <label className={styles.field}>
            替代文本
            <input
              className={styles.textInput}
              aria-label="图片替代文本"
              placeholder="请补充替代文本"
              value={alt}
              onChange={(event) => updateAttributes({ alt: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            图注
            <input
              className={styles.textInput}
              aria-label="图片图注"
              placeholder="可选图注"
              value={caption}
              onChange={(event) => updateAttributes({ caption: event.target.value })}
            />
          </label>
          <label className={styles.widthField}>
            宽度 {width}%
            <input
              aria-label="图片宽度"
              type="range"
              min={10}
              max={100}
              step={5}
              value={width}
              onChange={(event) => updateAttributes({ width: Number(event.target.value) })}
            />
          </label>
          <div className={styles.alignment} role="group" aria-label="图片对齐">
            {(['left', 'center', 'right'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={styles.alignButton}
                aria-label={
                  value === 'left' ? '图片左对齐' : value === 'right' ? '图片右对齐' : '图片居中'
                }
                aria-pressed={align === value}
                onClick={() => updateAttributes({ align: value })}
              >
                {value === 'left' ? '左' : value === 'right' ? '右' : '中'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </NodeViewWrapper>
  )
}
