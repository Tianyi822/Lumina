import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AttachedDocument,
  AttachedImage,
  KnowledgeBase,
  MCPTool,
  UserInteractionRequest
} from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import type { CapabilitySuggestionData } from '@renderer/stores/paperChatStreamStore'
import SvgIcon from '@renderer/components/icons/SvgIcon'
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
import PaperChatModelSelector from './input/PaperChatModelSelector'
import PaperChatToolSelectionBar from './input/PaperChatToolSelectionBar'
import { UserInteractionList } from './UserInteractionList'
import inputStyles from './PaperChatInput.module.css'
import toolbarStyles from './input/PaperChatToolSelectionBar.module.css'
import textareaStyles from './input/PaperChatTextarea.module.css'
import docStyles from './input/PaperChatAttachedDocuments.module.css'
import imageStyles from './input/PaperChatAttachedImages.module.css'
import quoteStyles from './input/PaperChatAttachedQuotes.module.css'
import processingStyles from './input/PaperChatProcessingFiles.module.css'

// selector 空态必须复用同一引用，否则每次渲染返回新数组会触发无限重渲染
const EMPTY_LIST: never[] = []

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
  enablePaperWebSearch: boolean
  isSending: boolean
  disabled?: boolean
  isDragging?: boolean
  /** 是否允许论文引文附件；写作面板传 false */
  allowPaperQuotes?: boolean
  /** 是否允许论文联网搜索；写作面板传 false */
  allowPaperWebSearch?: boolean
  quickReply?: PaperChatQuickReply | null
  userInteraction?: UserInteractionRequest | null
  showUserInteraction?: boolean
  showCapabilitySuggestion?: boolean
  capabilitySuggestion?: CapabilitySuggestionData | null
  onUpdateInput: (value: string) => void
  onUpdateSelectedModel: (value: string) => void
  onUpdateSelectedTools: (value: MCPTool[]) => void
  onUpdateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  onUpdateEnablePaperWebSearch: (value: boolean) => void
  onEnablePaperWebSearch?: () => Promise<boolean>
  onDismissQuickReply?: (messageId: string) => void
  onHideUserInteraction?: () => void
  onHideCapabilitySuggestion?: () => void
  onSend: (
    content: string,
    attachedDocuments?: AttachedDocument[],
    attachedImages?: AttachedImage[],
    attachedQuotes?: PaperQuote[]
  ) => Promise<void>
  onStop: () => Promise<void>
}

/** 截取引文选中文本的前 42 个字符作为预览 */
function quotePreview(quote: PaperQuote): string {
  const text = quote.selectedText.replace(/\s+/g, ' ').trim()
  return text.length > 42 ? `${text.slice(0, 42)}...` : text
}

/** 论文聊天输入组件，包含文本输入、附件管理（文档/图片/引文）、快速回复和工具选择栏 */
export default function PaperChatInput({
  sessionId,
  inputMessage,
  selectedModel,
  selectedMCPTools,
  selectedKnowledgeBases,
  enablePaperWebSearch,
  isSending,
  disabled,
  isDragging = false,
  allowPaperQuotes = true,
  allowPaperWebSearch = true,
  quickReply,
  userInteraction,
  showUserInteraction,
  showCapabilitySuggestion,
  capabilitySuggestion,
  onUpdateInput,
  onUpdateSelectedModel,
  onUpdateSelectedTools,
  onUpdateSelectedKnowledgeBases,
  onUpdateEnablePaperWebSearch,
  onEnablePaperWebSearch,
  onDismissQuickReply,
  onHideUserInteraction,
  onHideCapabilitySuggestion,
  onSend,
  onStop
}: PaperChatInputProps) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const [attachmentError, setAttachmentError] = useState('')

  const pendingDocuments = usePaperChatDocumentUploadStore((s) =>
    sessionId ? s.getSessionDocuments(sessionId) : EMPTY_LIST
  )
  const processingFiles = usePaperChatDocumentUploadStore((s) =>
    sessionId ? s.getSessionProcessingFiles(sessionId) : EMPTY_LIST
  )
  const pendingImages = usePaperChatImageUploadStore((s) =>
    sessionId ? s.getSessionImages(sessionId) : EMPTY_LIST
  )
  const processingImages = usePaperChatImageUploadStore((s) =>
    sessionId ? s.getSessionProcessingImages(sessionId) : EMPTY_LIST
  )
  const pendingQuotes = usePaperChatQuoteStore((s) =>
    sessionId && allowPaperQuotes ? s.getSessionQuotes(sessionId) : EMPTY_LIST
  )

  // 检查是否有待发送的附件（文档、图片或引文）
  const hasAttachments =
    pendingDocuments.length > 0 || pendingImages.length > 0 || pendingQuotes.length > 0
  const totalAttachmentCount = pendingDocuments.length + pendingImages.length + pendingQuotes.length
  // 允许发送的条件：有消息内容或附件，且不在禁用或发送状态
  const canSend = Boolean(inputMessage.trim() || hasAttachments) && !disabled && !isSending
  // 快速回复面板：AI 给出多个候选回答供用户一键选择
  const showQuickReplyDock = Boolean(quickReply && quickReply.options.length > 0 && !isSending)
  // 能力建议面板：推荐开启某项功能（如联网搜索）
  const showCapabilitySuggestionDock = Boolean(
    showCapabilitySuggestion && capabilitySuggestion && !isSending
  )
  // 用户交互面板：AI 需要用户作出选择才能继续
  const showUserInteractionDock = Boolean(showUserInteraction && userInteraction && !isSending)
  // 三种交互面板在同一位置互斥显示
  const showInteractionDock =
    showQuickReplyDock || showCapabilitySuggestionDock || showUserInteractionDock

  // 切换 sessionId 时，初始化对应会话的附件状态（文档/图片/引文）
  useEffect(() => {
    if (!sessionId) return
    usePaperChatDocumentUploadStore.getState().initSession(sessionId)
    usePaperChatImageUploadStore.getState().initSession(sessionId)
    if (allowPaperQuotes) {
      usePaperChatQuoteStore.getState().initSession(sessionId)
    }
  }, [allowPaperQuotes, sessionId])

  async function handleFiles(files: File[]): Promise<void> {
    if (!sessionId || files.length === 0) return
    setAttachmentError('')
    // 按类型分流：图片压缩后上传，文档走解析管道
    const imageFiles = files.filter(isImageFile)
    const documentFiles = files.filter((file) => !isImageFile(file))

    try {
      if (imageFiles.length > 0) {
        const result = await usePaperChatImageUploadStore
          .getState()
          .addImages(sessionId, imageFiles)
        if (result.errors.length > 0) {
          setAttachmentError(result.errors.join('\uff1b'))
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
    const quotes = allowPaperQuotes
      ? usePaperChatQuoteStore.getState().getPendingQuotesForSending(sessionId)
      : []

    // 立即清空输入栏和所有待发送附件，避免异步发送期间的竞态条件
    onUpdateInput('')
    usePaperChatDocumentUploadStore.getState().clearPendingDocuments(sessionId)
    usePaperChatImageUploadStore.getState().clearImages(sessionId)
    if (allowPaperQuotes) {
      usePaperChatQuoteStore.getState().clearQuotes(sessionId)
    }
    onDismissQuickReply?.(quickReply?.messageId || '')
    onHideUserInteraction?.()
    onHideCapabilitySuggestion?.()

    await onSend(content, docs, images, quotes)
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
    <>
      {showInteractionDock && (
        <div className={inputStyles['paper-chat-input__interaction-dock']}>
          {showQuickReplyDock && quickReply && (
            <section className={inputStyles['paper-chat-input__interaction-card']}>
              <div className={inputStyles['paper-chat-input__interaction-header']}>
                <span className={inputStyles['paper-chat-input__interaction-title']}>
                  {quickReply.question || t('paper.chat.input.replyPlaceholder')}
                </span>
                <button
                  className={inputStyles['paper-chat-input__interaction-button']}
                  type="button"
                  onClick={() => onDismissQuickReply?.(quickReply.messageId)}
                >
                  {t('paper.chat.input.custom')}
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
            </section>
          )}

          {showCapabilitySuggestionDock && capabilitySuggestion && (
            <section className={inputStyles['paper-chat-input__interaction-card']}>
              <div className={inputStyles['paper-chat-input__interaction-header']}>
                <span className={inputStyles['paper-chat-input__interaction-title']}>
                  {t('paper.chat.input.suggestCapabilities')}
                </span>
                <button
                  className={inputStyles['paper-chat-input__interaction-button']}
                  type="button"
                  onClick={() => {
                    for (const cap of capabilitySuggestion.capabilities) {
                      window.api.capability.respondSuggestion(sessionId, cap.id, false)
                    }
                    onHideCapabilitySuggestion?.()
                  }}
                >
                  {t('paper.chat.input.ignore')}
                </button>
              </div>
              <div className={toolbarStyles['paper-chat-input-toolbar']}>
                {capabilitySuggestion.capabilities.map((cap) => (
                  <button
                    key={cap.id}
                    className="sm-button sm-button--primary"
                    type="button"
                    title={cap.description}
                    onClick={() => {
                      window.api.capability.respondSuggestion(sessionId, cap.id, true)
                      onHideCapabilitySuggestion?.()
                    }}
                  >
                    {t('paper.chat.input.enableCapability', { name: cap.displayName })}
                  </button>
                ))}
              </div>
              {capabilitySuggestion.capabilities.map((cap) =>
                cap.reason ? (
                  <p key={cap.id} className={inputStyles['paper-chat-input__interaction-note']}>
                    {cap.reason}
                  </p>
                ) : null
              )}
            </section>
          )}

          {showUserInteractionDock && userInteraction && (
            <UserInteractionList
              interaction={userInteraction}
              onSelect={(option) =>
                handleSend(t('paper.chat.input.selectOption', { value: option.value }))
              }
              onLater={onHideUserInteraction}
            />
          )}
        </div>
      )}

      {attachmentError && (
        <div className={inputStyles['paper-chat-input__warning']}>
          <span className={inputStyles['paper-chat-input__warning-label']}>
            {t('paper.chat.input.attachment')}
          </span>
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
                \u00d7
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
                \u00d7
              </button>
            </div>
          ))}
        </div>
      )}

      {allowPaperQuotes && pendingQuotes.length > 0 && (
        <div className={quoteStyles['paper-chat-input__pending-quotes']}>
          {pendingQuotes.map((quote) => (
            <div key={quote.id} className={quoteStyles['paper-chat-input__pending-quote']}>
              <SvgIcon
                className={quoteStyles['paper-chat-input__pending-quote-icon']}
                name="quote"
                size={12}
              />
              <span className={quoteStyles['paper-chat-input__pending-quote-label']}>
                {quote.viewKind === 'original'
                  ? t('paper.chat.quoteOriginal')
                  : t('paper.chat.quoteTranslation')}
              </span>
              <span className={quoteStyles['paper-chat-input__pending-quote-preview']}>
                {quotePreview(quote)}
              </span>
              {quote.surroundingContext?.contextualText.trim() && (
                <span className={quoteStyles['paper-chat-input__pending-quote-context']}>
                  {t('paper.chat.context')}
                </span>
              )}
              <button
                className={quoteStyles['paper-chat-input__pending-quote-remove']}
                type="button"
                disabled={isSending}
                onClick={() => usePaperChatQuoteStore.getState().removeQuote(sessionId, quote.id)}
              >
                \u00d7
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
          className={[
            textareaStyles['paper-chat-input__textarea'],
            isSending ? textareaStyles['is-sending'] || '' : '',
            isDragging ? textareaStyles['is-dragging'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          value={inputMessage}
          disabled={disabled || isSending}
          placeholder={
            quickReply
              ? t('paper.chat.input.customPlaceholder')
              : t('paper.chat.input.askPlaceholder')
          }
          onChange={(event) => onUpdateInput(event.target.value)}
          // 从粘贴板中提取文件（如截图），自动触发附件上传
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              void handleFiles(files)
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !isComposingRef.current &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              if (canSend) void handleSend()
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={() => {
            // 使用 requestAnimationFrame 延迟重置，防止 compositionend 后
            // 同一 Enter 按键触发的 keydown 误发消息
            requestAnimationFrame(() => {
              isComposingRef.current = false
            })
          }}
        />
        {/* 拖拽文件悬停时，显示释放以添加附件的浮层提示 */}
        {isDragging && (
          <div className={textareaStyles['paper-chat-input__drag-overlay']}>
            <div className={textareaStyles['paper-chat-input__drag-hint']}>
              <SvgIcon name="attachment" size={24} />
              <p>{t('paper.chat.input.dropToAttach')}</p>
            </div>
          </div>
        )}
      </div>

      <div className={inputStyles['paper-chat-input__footer']}>
        <PaperChatToolSelectionBar
          isSending={isSending}
          disabled={disabled}
          canSend={canSend}
          selectedTools={selectedMCPTools}
          selectedKnowledgeBases={selectedKnowledgeBases}
          enablePaperWebSearch={enablePaperWebSearch}
          allowPaperWebSearch={allowPaperWebSearch}
          totalAttachmentCount={totalAttachmentCount}
          onUpdateSelectedTools={onUpdateSelectedTools}
          onUpdateSelectedKnowledgeBases={onUpdateSelectedKnowledgeBases}
          onTogglePaperWebSearch={() => void togglePaperWebSearch()}
          onUpload={() => fileInputRef.current?.click()}
          onSend={() => void handleSend()}
          onStop={() => void onStop()}
        >
          <PaperChatModelSelector
            selectedModel={selectedModel}
            disabled={disabled || isSending}
            onUpdateSelectedModel={onUpdateSelectedModel}
          />
        </PaperChatToolSelectionBar>
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
    </>
  )
}

/** 展示单个文件/图片的上传处理进度或错误状态 */
function ProcessingFileRow({ file }: { file: ProcessingFile | ProcessingImage }) {
  return (
    <div className={processingStyles['processing-file-item']}>
      <span
        className={`${processingStyles['processing-status']} ${processingStyles[file.status] || ''}`}
      >
        <span>{file.fileName}</span>
        <span>{file.status}</span>
        {/* 上传出错的单个文件，显示具体错误原因 */}
        {'error' in file && file.error && (
          <span className={processingStyles['processing-error']}>{file.error}</span>
        )}
      </span>
    </div>
  )
}
