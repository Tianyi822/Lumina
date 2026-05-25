import { useEffect, useRef, useState } from 'react'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import LabToolsToggle from '@renderer/components/lab/LabToolsToggle'
import PaperChatMcpToolsPanel from './PaperChatMcpToolsPanel'
import PaperChatKnowledgeBasePanel from './PaperChatKnowledgeBasePanel'
import { SUPPORTED_DOC_TYPES } from './attachmentUtils'
import styles from './PaperChatToolSelectionBar.module.css'

interface PaperChatToolSelectionBarProps {
  isSending?: boolean
  disabled?: boolean
  canSend?: boolean
  selectedModel?: string
  modelOptions: string[]
  selectedTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools?: boolean
  enablePaperWebSearch?: boolean
  totalAttachmentCount?: number
  variant?: 'default' | 'compact'
  onUpdateSelectedModel: (value: string) => void
  onUpdateSelectedTools: (value: MCPTool[]) => void
  onUpdateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  onUpdateEnableLabTools: (value: boolean) => void
  onTogglePaperWebSearch: () => void
  onUpload: () => void
  onSend: () => void
  onStop: () => void
}

export default function PaperChatToolSelectionBar({
  isSending,
  disabled,
  canSend = true,
  selectedModel,
  modelOptions,
  selectedTools,
  selectedKnowledgeBases,
  enableLabTools,
  enablePaperWebSearch,
  totalAttachmentCount = 0,
  variant = 'default',
  onUpdateSelectedModel,
  onUpdateSelectedTools,
  onUpdateSelectedKnowledgeBases,
  onUpdateEnableLabTools,
  onTogglePaperWebSearch,
  onUpload,
  onSend,
  onStop
}: PaperChatToolSelectionBarProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const modelSelectorRef = useRef<HTMLDivElement | null>(null)
  const isCompact = variant === 'compact'
  const controlsDisabled = Boolean(disabled || isSending)
  const supportedDocumentLabel = SUPPORTED_DOC_TYPES.map((type) => type.slice(1)).join(', ')

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const selector = modelSelectorRef.current
      if (showModelDropdown && selector && !selector.contains(event.target as Node)) {
        setShowModelDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showModelDropdown])

  function selectModel(model: string): void {
    onUpdateSelectedModel(model)
    setShowModelDropdown(false)
  }

  function toggleModelDropdown(): void {
    if (!controlsDisabled) {
      setShowModelDropdown((current) => !current)
    }
  }

  return (
    <div
      className={[
        styles['paper-chat-input-toolbar'],
        isCompact ? styles['paper-chat-input-toolbar--compact'] || '' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div ref={modelSelectorRef} className={styles['paper-chat-input-toolbar__model-selector']}>
        <button
          className={`btn ${styles['paper-chat-input-toolbar__model-button']}`}
          type="button"
          disabled={controlsDisabled || modelOptions.length === 0}
          onClick={toggleModelDropdown}
        >
          <span>{selectedModel || '选择模型'}</span>
          <span
            className={[
              styles['paper-chat-input-toolbar__dropdown-arrow'],
              showModelDropdown ? styles.open || '' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            ▼
          </span>
        </button>
        {showModelDropdown && (
          <div className={styles['paper-chat-input-toolbar__model-dropdown']}>
            {modelOptions.length === 0 ? (
              <div
                className={[styles['paper-chat-input-toolbar__model-option'], styles.empty || '']
                  .filter(Boolean)
                  .join(' ')}
              >
                暂无模型配置
              </div>
            ) : (
              modelOptions.map((model) => (
                <div
                  key={model}
                  className={[
                    styles['paper-chat-input-toolbar__model-option'],
                    model === selectedModel ? styles.active || '' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectModel(model)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectModel(model)
                    }
                  }}
                >
                  {model}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <PaperChatMcpToolsPanel
        compact={isCompact}
        selectedTools={selectedTools}
        onToolsSelected={onUpdateSelectedTools}
      />

      <PaperChatKnowledgeBasePanel
        compact={isCompact}
        selectedKnowledgeBases={selectedKnowledgeBases}
        onSelectionChange={onUpdateSelectedKnowledgeBases}
      />

      <button
        type="button"
        className={[
          styles['paper-chat-input-toolbar__search-toggle'],
          enablePaperWebSearch ? styles.enabled || '' : '',
          isCompact ? styles['is-compact'] || '' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={controlsDisabled}
        aria-pressed={enablePaperWebSearch ? 'true' : 'false'}
        title="联网搜索：允许模型在需要时搜索学术资料补充论文信息"
        onClick={onTogglePaperWebSearch}
      >
        <span
          className={[styles['toggle-switch'], 'toggle-switch'].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          <span className={[styles['toggle-thumb'], 'toggle-thumb'].filter(Boolean).join(' ')} />
        </span>
        <span className={[styles['toggle-label'], 'toggle-label'].filter(Boolean).join(' ')}>
          搜索
        </span>
      </button>

      <LabToolsToggle
        compact={isCompact}
        modelValue={Boolean(enableLabTools)}
        disabled={controlsDisabled}
        onUpdateModelValue={onUpdateEnableLabTools}
      />

      <div className={styles['paper-chat-input-toolbar__actions']}>
        <button
          className={[
            styles['paper-chat-input-toolbar__upload-button'],
            totalAttachmentCount > 0 ? styles['has-attachments'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          disabled={controlsDisabled}
          title={`上传文件 (文档: ${supportedDocumentLabel} / 图片: jpg, png, webp, bmp, tiff)`}
          onClick={onUpload}
        >
          <SvgIcon name="attachment" size={18} />
          {totalAttachmentCount > 0 && (
            <span className={styles['paper-chat-input-toolbar__attachment-count']}>
              {totalAttachmentCount}
            </span>
          )}
        </button>

        {!isSending ? (
          <button
            className={[
              'btn-primary',
              styles['paper-chat-input-toolbar__execute-button'],
              isCompact ? styles['paper-chat-input-toolbar__execute-button--compact'] || '' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            disabled={!canSend}
            title="发送"
            aria-label="发送"
            onClick={onSend}
          >
            {isCompact ? <SvgIcon name="send" size={17} /> : <span>发送</span>}
          </button>
        ) : (
          <button
            className={`btn-danger ${styles['paper-chat-input-toolbar__stop-button']}`}
            type="button"
            title="停止"
            aria-label="停止"
            onClick={onStop}
          >
            <SvgIcon name="stop" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
