import { createPortal } from 'react-dom'
import { forwardRef, type MouseEvent, type ReactNode } from 'react'

/** 模态框 Portal：将内容渲染到 document.body，支持 backdrop 点击关闭 */
interface ModalPortalProps {
  className?: string
  onBackdropClick?: () => void
  children: ReactNode
}

const ModalPortal = forwardRef<HTMLDivElement, ModalPortalProps>(function ModalPortal(
  { className, onBackdropClick, children },
  ref
) {
  const overlayClassName = ['sm-modal__overlay', className].filter(Boolean).join(' ')

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    onBackdropClick?.()
  }

  return createPortal(
    <div ref={ref} className={overlayClassName} onClick={onBackdropClick ? handleBackdropClick : undefined}>
      {children}
    </div>,
    document.body
  )
})

export default ModalPortal
