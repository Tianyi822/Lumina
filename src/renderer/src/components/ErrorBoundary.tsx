import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { i18n } from '@renderer/i18n'

/** 错误边界组件：捕获子组件渲染错误，展示错误信息并提供重新加载按钮 */
interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 渲染错误:', error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '2rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#e0e0e0',
            backgroundColor: '#1a1a1a'
          }}
        >
          <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>
            {i18n.t('chrome.app.errorTitle')}
          </h2>
          <pre
            style={{
              maxWidth: '600px',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: '#2a2a2a',
              color: '#ff6b6b',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1.5rem',
              border: '1px solid #444',
              borderRadius: '6px',
              backgroundColor: '#2a2a2a',
              color: '#e0e0e0',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            {i18n.t('chrome.app.reload')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
