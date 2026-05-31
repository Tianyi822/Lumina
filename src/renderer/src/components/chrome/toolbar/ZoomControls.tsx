import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

interface ZoomControlsProps {
  canZoomOut: boolean
  canZoomIn: boolean
  zoomPercent: number
  onZoomOut: () => void
  onResetZoom: () => void
  onZoomIn: () => void
}

export default function ZoomControls({
  canZoomOut,
  canZoomIn,
  zoomPercent,
  onZoomOut,
  onResetZoom,
  onZoomIn
}: ZoomControlsProps) {
  return (
    <>
      <button
        className={['sm-icon-button', styles['sm-workspace-toolbar__button']].join(' ')}
        title="缩小"
        aria-label="缩小"
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <SvgIcon name="zoom-out" size={14} />
      </button>
      <button
        className={[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          styles['sm-workspace-toolbar__zoom-display']
        ].join(' ')}
        title={`${zoomPercent}%`}
        aria-label="重置缩放"
        disabled={zoomPercent === 100}
        onClick={onResetZoom}
      >
        <span className={styles['sm-workspace-toolbar__zoom-text']}>{zoomPercent}%</span>
      </button>
      <button
        className={['sm-icon-button', styles['sm-workspace-toolbar__button']].join(' ')}
        title="放大"
        aria-label="放大"
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <SvgIcon name="zoom-in" size={14} />
      </button>
    </>
  )
}
