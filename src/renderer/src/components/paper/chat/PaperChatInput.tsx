import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AttachedDocument,
  AttachedImage,
  KnowledgeBase,
  MCPTool,
  UserInteractionRequest
} from '@renderer/types'
import type { AppConfig } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import LabToolsToggle from '@renderer/components/lab/LabToolsToggle'
import { useMCPStore } from '@renderer/stores/mcpStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import {
  usePaperChatDocumentUploadStore,
  type ProcessingFile
} from '@renderer/stores/paperChatDocumentUploadStore'
import {
  isImageFile,
  usePaperChatImageUploadStore,
  type ProcessingImage
} from '@renderer/stores/paperChatImageUploadStore'
import { usePaperChatQuoteStore } from '@renderer/stores/paperChatQuoteStore'
import {
  SUPPORTED_DOC_ACCEPT,
  formatFileSize,
  toPaperChatAttachedDocuments,
  toPaperChatAttachedImages
} from './input/attachmentUtils'
import inputStyles from './PaperChatInput.module.css'
import toolbarStyles from './input/PaperChatToolSelectionBar.module.css'
import textareaStyles from './input/PaperChatTextarea.module.css'
import docStyles from './input/PaperChatAttachedDocuments.module.css'
import imageStyles from './input/PaperChatAttachedImages.module.css'
import quoteStyles from './input/PaperChatAttachedQuotes.module.css'
import processingStyles from './input/PaperChatProcessingFiles.module.css'

interface QuickReplyOption {
  id: string
  label: string
  fullText: string
}

export interface PaperChatQuickReply {
  messageId: string
  question: string
  options: QuickReplyOption[]
  suffix?: string
}

interface PaperChatInputProps {
  sessionId: string
  inputMessage: string
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools: boolean
  enablePaperWebSearch: boolean
  isSending: boolean
  disabled?: boolean
  compact?: boolean
  quickReply?: PaperChatQuickReply | null
  userInteraction?: UserInteractionRequest | null
  showUserInteraction?: boolean
  onUpdateInput: (value: string) => void
  onUpdateSelectedModel: (value: string) => void
  onUpdateSelectedTools: (value: MCPTool[]) => void
  onUpdateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  onUpdateEnableLabTools: (value: boolean) => void
  onUpdateEnablePaperWebSearch: (value: boolean) => void
  onEnablePaperWebSearch?: () => Promise<boolean>
  onDismissQuickReply?: (messageId: string) => void
  onHideUserInteraction?: () => void
  onSend: (
    content: string,
    attachedDocuments?: AttachedDocument[],
    attachedImages?: AttachedImage[],
    attachedQuotes?: PaperQuote[]
  ) => Promise<void>
  onStop: () => Promise<void>
}

function useConfiguredModels(
  selectedModel: string,
  updateSelectedModel: (value: string) => void
): string[] {
  const configUpdateKey = useUIStateStore((s) => s.configUpdateKey)
  const [modelOptions, setModelOptions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadConfiguredModels(): Promise<void> {
      try {
        const config = (await window.api.config.getConfig()) as AppConfig | null
        const models = config?.llm_config?.models?.map((model) => model.model_name) || []
        if (cancelled) return
        setModelOptions(models)

        if (selectedModel && models.includes(selectedModel)) {
          return
        }

        const defaultModel = config?.llm_config?.default_model
        if (defaultModel && models.includes(defaultModel)) {
          updateSelectedModel(defaultModel)
        } else {
          updateSelectedModel(models[0] || '')
        }
      } catch (error) {
        window.api.logger.error('[PaperChatInput] 加载模型配置失败', {
          error: error instanceof Error ? error.message : String(error)
        })
        if (!cancelled) {
          setModelOptions([])
          if (selectedModel) updateSelectedModel('')
        }
      }
    }

    void loadConfiguredModels()

    return () => {
      cancelled = true
    }
  }, [configUpdateKey, selectedModel, updateSelectedModel])

  return modelOptions
}

function quotePreview(quote: PaperQuote): string {
  const text = quote.selectedText.replace(/\s+/g, ' ').trim()
  return text.length > 42 ? `${text.slice(0, 42)}...` : text
}

export default function PaperChatInput({
  sessionId,
  inputMessage,
  selectedModel,
  selectedMCPTools,
  selectedKnowledgeBases,
  enableLabTools,
  enablePaperWebSearch,
  isSending,
  disabled,
  compact = false,
  quickReply,
  userInteraction,
  showUserInteraction,
  onUpdateInput,
  onUpdateSelectedModel,
  onUpdateSelectedTools,
  onUpdateSelectedKnowledgeBases,
  onUpdateEnableLabTools,
  onUpdateEnablePaperWebSearch,
  onEnablePaperWebSearch,
  onDismissQuickReply,
  onHideUserInteraction,
  onSend,
  onStop
}: PaperChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [kbOptions, setKbOptions] = useState<KnowledgeBase[]>([])
  const [attachmentError, setAttachmentError] = useState('')

  const modelOptions = useConfiguredModels(selectedModel, onUpdateSelectedModel)
  const toolsByServer = useMCPStore((s) => s.toolsByServer)
  const loadAllTools = useMCPStore((s) => s.loadAllTools)
  const pendingDocuments = usePaperChatDocumentUploadStore((s) =>
    sessionId ? s.getSessionDocuments(sessionId) : []
  )
  const processingFiles = usePaperChatDocumentUploadStore((s) =>
    sessionId ? s.getSessionProcessingFiles(sessionId) : []
  )
  const pendingImages = usePaperChatImageUploadStore((s) =>
    sessionId ? s.getSessionImages(sessionId) : []
  )
  const processingImages = usePaperChatImageUploadStore((s) =>
    sessionId ? s.getSessionProcessingImages(sessionId) : []
  )
  const pendingQuotes = usePaperChatQuoteStore((s) =>
    sessionId ? s.getSessionQuotes(sessionId) : []
  )

  const allTools = useMemo(
    () =>
      Object.entries(toolsByServer).flatMap(([serverName, tools]) =>
        tools.map((tool) => ({ ...tool, serverName }))
      ),
    [toolsByServer]
  )

  const hasAttachments =
    pendingDocuments.length > 0 || pendingImages.length > 0 || pendingQuotes.length > 0
  const canSend = Boolean(inputMessage.trim() || hasAttachments) && !disabled && !isSending

  useEffect(() => {
    if (!sessionId) return
    usePaperChatDocumentUploadStore.getState().initSession(sessionId)
    usePaperChatImageUploadStore.getState().initSession(sessionId)
    usePaperChatQuoteStore.getState().initSession(sessionId)
  }, [sessionId])

  useEffect(() => {
    void loadAllTools()
  }, [loadAllTools])

  useEffect(() => {
    let cancelled = false
    async function loadKnowledgeBases(): Promise<void> {
      try {
        const result = await window.api.knowledge.getAll()
        if (!cancelled && result.success && result.data) {
          setKbOptions(result.data)
        }
      } catch (error) {
        window.api.logger.error('[PaperChatInput] 加载知识库列表失败', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    void loadKnowledgeBases()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFiles(files: File[]): Promise<void> {
    if (!sessionId || files.length === 0) return
    setAttachmentError('')
    const imageFiles = files.filter(isImageFile)
    const documentFiles = files.filter((file) => !isImageFile(file))

    try {
      if (imageFiles.length > 0) {
        const result = await usePaperChatImageUploadStore
          .getState()
          .addImages(sessionId, imageFiles)
        if (result.errors.length > 0) {
          setAttachmentError(result.errors.join('；'))
        }
      }
      if (documentFiles.length > 0) {
        await usePaperChatDocumentUploadStore
          .getState()
          .uploadMultipleDocuments(sessionId, documentFiles)
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSend(contentOverride?: string): Promise<void> {
    const content = contentOverride ?? inputMessage
    const docs = toPaperChatAttachedDocuments(
      usePaperChatDocumentUploadStore.getState().getPendingDocumentsForSending(sessionId)
    )
    const images = toPaperChatAttachedImages(
      usePaperChatImageUploadStore.getState().getSessionImages(sessionId)
    )
    const quotes = usePaperChatQuoteStore.getState().getPendingQuotesForSending(sessionId)

    await onSend(content, docs, images, quotes)
    onUpdateInput('')
    usePaperChatDocumentUploadStore.getState().clearPendingDocuments(sessionId)
    usePaperChatImageUploadStore.getState().clearImages(sessionId)
    usePaperChatQuoteStore.getState().clearQuotes(sessionId)
    onDismissQuickReply?.(quickReply?.messageId || '')
    onHideUserInteraction?.()
  }

  function toggleTool(tool: MCPTool): void {
    const exists = selectedMCPTools.some(
      (item) => item.serverName === tool.serverName && item.name === tool.name
    )
    onUpdateSelectedTools(
      exists
        ? selectedMCPTools.filter(
            (item) => !(item.serverName === tool.serverName && item.name === tool.name)
          )
        : [...selectedMCPTools, tool]
    )
  }

  function toggleKnowledgeBase(kb: KnowledgeBase): void {
    const exists = selectedKnowledgeBases.some((item) => item.id === kb.id)
    onUpdateSelectedKnowledgeBases(
      exists
        ? selectedKnowledgeBases.filter((item) => item.id !== kb.id)
        : [...selectedKnowledgeBases, kb]
    )
  }

  const togglePaperWebSearch = useCallback(async (): Promise<void> => {
    if (enablePaperWebSearch) {
      onUpdateEnablePaperWebSearch(false)
      return
    }
    const allowed = (await onEnablePaperWebSearch?.()) ?? true
    if (allowed) {
      onUpdateEnablePaperWebSearch(true)
    }
  }, [enablePaperWebSearch, onEnablePaperWebSearch, onUpdateEnablePaperWebSearch])

  return (
    <div
      className={`${inputStyles['paper-chat-input']} ${
        compact ? inputStyles['paper-chat-input--compact'] : ''
      }`}
      onDragEnter={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setIsDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        void handleFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {quickReply && quickReply.options.length > 0 && !isSending && (
        <div className={inputStyles['paper-chat-input__quick-reply']}>
          <div className={inputStyles['paper-chat-input__quick-reply-header']}>
            <span className={inputStyles['paper-chat-input__quick-reply-title']}>
              {quickReply.question || '选择一个回复'}
            </span>
            <button
              className={inputStyles['paper-chat-input__quick-reply-custom-button']}
              type="button"
              onClick={() => onDismissQuickReply?.(quickReply.messageId)}
            >
              自定义
            </button>
          </div>
          <div className={toolbarStyles['paper-chat-input-toolbar']}>
            {quickReply.options.map((option) => (
              <button
                key={option.id}
                className="sm-button sm-button--secondary"
                type="button"
                onClick={() => handleSend(option.fullText)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showUserInteraction && userInteraction && !isSending && (
        <div className={inputStyles['paper-chat-input__quick-reply']}>
          <div className={inputStyles['paper-chat-input__quick-reply-header']}>
            <span className={inputStyles['paper-chat-input__quick-reply-title']}>
              {userInteraction.question}
            </span>
            <button
              className={inputStyles['paper-chat-input__quick-reply-custom-button']}
              type="button"
              onClick={onHideUserInteraction}
            >
              稍后
            </button>
          </div>
          <div className={toolbarStyles['paper-chat-input-toolbar']}>
            {userInteraction.options.map((option) => (
              <button
                key={option.value}
                className="sm-button sm-button--secondary"
                type="button"
                title={option.description}
                onClick={() => handleSend(`我选择：${option.label}`)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {attachmentError && (
        <div className={inputStyles['paper-chat-input__warning']}>
          <span className={inputStyles['paper-chat-input__warning-label']}>附件</span>
          <span>{attachmentError}</span>
        </div>
      )}

      {pendingDocuments.length > 0 && (
        <div className={docStyles['paper-chat-input__pending-documents']}>
          {pendingDocuments.map((doc, index) => (
            <div
              key={`${doc.fileName}-${index}`}
              className={docStyles['paper-chat-input__pending-document']}
            >
              <span className={docStyles['paper-chat-input__pending-document-info']}>
                <span className={docStyles['paper-chat-input__pending-document-name']}>
                  {doc.fileName}
                </span>
                <span className={docStyles['paper-chat-input__pending-document-size']}>
                  {formatFileSize(doc.fileSize)}
                </span>
              </span>
              <button
                className={docStyles['paper-chat-input__pending-document-remove']}
                type="button"
                disabled={isSending}
                onClick={() =>
                  usePaperChatDocumentUploadStore.getState().removePendingDocument(sessionId, index)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className={imageStyles['paper-chat-input__pending-images']}>
          {pendingImages.map((image, index) => (
            <div
              key={`${image.fileName}-${index}`}
              className={imageStyles['paper-chat-input__pending-image']}
            >
              <img
                className={imageStyles['paper-chat-input__pending-image-thumbnail']}
                src={image.thumbnailData}
                alt={image.fileName}
              />
              <span className={imageStyles['paper-chat-input__pending-image-info']}>
                <span className={imageStyles['paper-chat-input__pending-image-name']}>
                  {image.fileName}
                </span>
                <span className={imageStyles['paper-chat-input__pending-image-size']}>
                  {formatFileSize(image.compressedSize)}
                </span>
              </span>
              <button
                className={imageStyles['paper-chat-input__pending-image-remove']}
                type="button"
                disabled={isSending}
                onClick={() =>
                  usePaperChatImageUploadStore.getState().removeImage(sessionId, index)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingQuotes.length > 0 && (
        <div className={quoteStyles['paper-chat-input__pending-quotes']}>
          {pendingQuotes.map((quote) => (
            <div key={quote.id} className={quoteStyles['paper-chat-input__pending-quote']}>
              <SvgIcon
                className={quoteStyles['paper-chat-input__pending-quote-icon']}
                name="quote"
                size={12}
              />
              <span className={quoteStyles['paper-chat-input__pending-quote-label']}>
                {quote.viewKind === 'original' ? '原文引用' : '译文引用'}
              </span>
              <span className={quoteStyles['paper-chat-input__pending-quote-preview']}>
                {quotePreview(quote)}
              </span>
              {quote.surroundingContext?.contextualText.trim() && (
                <span className={quoteStyles['paper-chat-input__pending-quote-context']}>
                  上下文
                </span>
              )}
              <button
                className={quoteStyles['paper-chat-input__pending-quote-remove']}
                type="button"
                disabled={isSending}
                onClick={() => usePaperChatQuoteStore.getState().removeQuote(sessionId, quote.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {(processingFiles.length > 0 || processingImages.length > 0) && (
        <div className={processingStyles['processing-files-list']}>
          {[...processingFiles, ...processingImages].map((file) => (
            <ProcessingFileRow key={file.tempId} file={file} />
          ))}
        </div>
      )}

      <div className={textareaStyles['paper-chat-input__textarea-wrapper']}>
        <textarea
          ref={textareaRef}
          className={`${textareaStyles['paper-chat-input__textarea']} ${
            isSending ? textareaStyles['is-sending'] || '' : ''
          } ${isDragging ? textareaStyles['is-dragging'] || '' : ''}`}
          value={inputMessage}
          disabled={disabled || isSending}
          placeholder="输入关于这篇论文的问题..."
          onChange={(event) => onUpdateInput(event.target.value)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              void handleFiles(files)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (canSend) void handleSend()
            }
          }}
        />
        {isDragging && (
          <div className={textareaStyles['paper-chat-input__drag-overlay']}>
            <div className={textareaStyles['paper-chat-input__drag-hint']}>
              <SvgIcon name="attachment" size={24} />
              <p>释放以添加附件</p>
            </div>
          </div>
        )}
      </div>

      <div
        className={`${toolbarStyles['paper-chat-input-toolbar']} ${
          compact ? toolbarStyles['paper-chat-input-toolbar--compact'] : ''
        }`}
      >
        <select
          className={`${toolbarStyles['paper-chat-input-toolbar__model-button']} sm-button sm-button--secondary`}
          value={selectedModel}
          disabled={disabled || isSending || modelOptions.length === 0}
          onChange={(event) => onUpdateSelectedModel(event.target.value)}
        >
          {modelOptions.length === 0 ? (
            <option value="">未配置模型</option>
          ) : (
            modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))
          )}
        </select>

        <details>
          <summary className="sm-button sm-button--secondary">
            MCP {selectedMCPTools.length}
          </summary>
          <div className="sm-popover">
            {allTools.length === 0 ? (
              <span>暂无工具</span>
            ) : (
              allTools.map((tool) => (
                <label key={`${tool.serverName}-${tool.name}`}>
                  <input
                    type="checkbox"
                    checked={selectedMCPTools.some(
                      (item) => item.serverName === tool.serverName && item.name === tool.name
                    )}
                    onChange={() => toggleTool(tool)}
                  />
                  {tool.serverName} / {tool.name}
                </label>
              ))
            )}
          </div>
        </details>

        <details>
          <summary className="sm-button sm-button--secondary">
            知识库 {selectedKnowledgeBases.length}
          </summary>
          <div className="sm-popover">
            {kbOptions.length === 0 ? (
              <span>暂无知识库</span>
            ) : (
              kbOptions.map((kb) => (
                <label key={kb.id}>
                  <input
                    type="checkbox"
                    checked={selectedKnowledgeBases.some((item) => item.id === kb.id)}
                    onChange={() => toggleKnowledgeBase(kb)}
                  />
                  {kb.name}
                </label>
              ))
            )}
          </div>
        </details>

        <button
          className={`${toolbarStyles['paper-chat-input-toolbar__search-toggle']} ${
            enablePaperWebSearch ? 'is-active' : ''
          }`}
          type="button"
          disabled={disabled || isSending}
          onClick={() => void togglePaperWebSearch()}
        >
          联网 {enablePaperWebSearch ? '开' : '关'}
        </button>

        <LabToolsToggle
          modelValue={enableLabTools}
          disabled={disabled || isSending}
          compact
          onUpdateModelValue={onUpdateEnableLabTools}
        />

        <div className={toolbarStyles['paper-chat-input-toolbar__actions']}>
          <button
            className={`${toolbarStyles['paper-chat-input-toolbar__upload-button']} ${
              hasAttachments ? toolbarStyles['has-attachments'] || '' : ''
            }`}
            type="button"
            disabled={disabled || isSending}
            onClick={() => fileInputRef.current?.click()}
            title="添加附件"
          >
            <SvgIcon name="attachment" size={16} />
            {hasAttachments && (
              <span className={toolbarStyles['paper-chat-input-toolbar__attachment-count']}>
                {pendingDocuments.length + pendingImages.length + pendingQuotes.length}
              </span>
            )}
          </button>

          {isSending ? (
            <button
              className={`${toolbarStyles['paper-chat-input-toolbar__stop-button']} sm-button`}
              type="button"
              onClick={() => void onStop()}
            >
              <SvgIcon name="stop" size={14} />
            </button>
          ) : (
            <button
              className={`${toolbarStyles['paper-chat-input-toolbar__execute-button']} ${
                compact ? toolbarStyles['paper-chat-input-toolbar__execute-button--compact'] : ''
              } sm-button`}
              type="button"
              disabled={!canSend}
              onClick={() => void handleSend()}
              title="发送"
            >
              <SvgIcon name="send" size={14} />
              {!compact && <span>发送</span>}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept={`${SUPPORTED_DOC_ACCEPT},image/*`}
        onChange={(event) => {
          const files = Array.from(event.target.files || [])
          event.currentTarget.value = ''
          void handleFiles(files)
        }}
      />
    </div>
  )
}

function ProcessingFileRow({ file }: { file: ProcessingFile | ProcessingImage }) {
  return (
    <div className={processingStyles['processing-file-item']}>
      <span
        className={`${processingStyles['processing-status']} ${processingStyles[file.status] || ''}`}
      >
        <span>{file.fileName}</span>
        <span>{file.status}</span>
        {'error' in file && file.error && (
          <span className={processingStyles['processing-error']}>{file.error}</span>
        )}
      </span>
    </div>
  )
}
