import type { WriterAiContextBlock } from '@shared/types/writer'

export function createLoadingPreviewElement(label: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'sm-writer-diff-pending'
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')

  const labelSpan = document.createElement('span')
  labelSpan.className = 'sm-writer-diff-pending-label'
  labelSpan.textContent = label
  root.appendChild(labelSpan)

  for (let i = 0; i < 3; i++) {
    const skeleton = document.createElement('div')
    skeleton.className = 'sm-writer-diff-pending-skeleton'
    root.appendChild(skeleton)
  }

  return root
}

export function createBlocksPreviewElement(blocks: WriterAiContextBlock[]): HTMLElement {
  const root = document.createElement('div')
  root.className = 'sm-writer-diff-add-blocks'

  for (const block of blocks) {
    const child = document.createElement('div')
    child.className = 'sm-writer-diff-add-block'
    child.setAttribute('data-block-type', block.type)
    if (block.type === 'heading' && block.level !== undefined) {
      child.setAttribute('data-heading-level', String(block.level))
    }
    child.textContent = block.text
    root.appendChild(child)
  }

  return root
}

export function createInlineAddElement(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'sm-writer-diff-add'
  span.textContent = text
  return span
}
