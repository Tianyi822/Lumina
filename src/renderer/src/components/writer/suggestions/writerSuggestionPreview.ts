import type { WriterAiContextBlock } from '@shared/types/writer'
import { i18n } from '@renderer/i18n'

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

export interface OperationToolbarOptions {
  operationIndex: number
  showBatchActions: boolean
  pendingCount: number
  onAcceptOne: (operationIndex: number) => void
  onRejectOne: (operationIndex: number) => void
  onAcceptAll: () => void
  onRejectAll: () => void
}

function createToolbarButton(
  label: string,
  ariaLabel: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', ariaLabel)
  button.textContent = label
  // 阻止 mousedown 抢焦点，避免编辑器选区跳动
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return button
}

/** 预览旁紧凑操作条：单条接受/拒绝；多项时首项附带批量动作 */
export function createOperationToolbarElement(options: OperationToolbarOptions): HTMLElement {
  // 使用 span，便于挂到内联预览旁而不破坏 HTML 嵌套
  const root = document.createElement('span')
  root.className = 'sm-writer-diff-toolbar'
  root.setAttribute('role', 'toolbar')
  root.setAttribute('aria-label', i18n.t('writer.suggestions.ariaLabel'))
  // 悬浮控件：不参与 contenteditable 编辑与原生选区绘制
  root.setAttribute('contenteditable', 'false')
  root.setAttribute('data-writer-floating-toolbar', 'true')
  root.setAttribute('aria-hidden', 'false')

  if (options.showBatchActions) {
    const summary = document.createElement('span')
    summary.className = 'sm-writer-diff-toolbar__summary'
    summary.textContent = i18n.t('writer.suggestions.pendingCount', { count: options.pendingCount })
    root.appendChild(summary)
    root.appendChild(
      createToolbarButton(
        i18n.t('writer.suggestions.acceptAll'),
        i18n.t('writer.suggestions.acceptAllAria'),
        'sm-writer-diff-toolbar__btn sm-writer-diff-toolbar__btn--primary',
        () => options.onAcceptAll()
      )
    )
    root.appendChild(
      createToolbarButton(
        i18n.t('writer.suggestions.rejectAll'),
        i18n.t('writer.suggestions.rejectAllAria'),
        'sm-writer-diff-toolbar__btn sm-writer-diff-toolbar__btn--reject',
        () => options.onRejectAll()
      )
    )
    const divider = document.createElement('span')
    divider.className = 'sm-writer-diff-toolbar__divider'
    divider.setAttribute('aria-hidden', 'true')
    root.appendChild(divider)
  }

  root.appendChild(
    createToolbarButton(
      i18n.t('writer.suggestions.accept'),
      i18n.t('writer.suggestions.acceptAria'),
      'sm-writer-diff-toolbar__btn sm-writer-diff-toolbar__btn--primary',
      () => options.onAcceptOne(options.operationIndex)
    )
  )
  root.appendChild(
    createToolbarButton(
      i18n.t('writer.suggestions.reject'),
      i18n.t('writer.suggestions.rejectAria'),
      'sm-writer-diff-toolbar__btn sm-writer-diff-toolbar__btn--reject',
      () => options.onRejectOne(options.operationIndex)
    )
  )

  return root
}

/** 将操作条挂到预览根节点末尾并返回该根节点 */
export function appendOperationToolbar(
  root: HTMLElement,
  options: OperationToolbarOptions
): HTMLElement {
  root.appendChild(createOperationToolbarElement(options))
  return root
}
