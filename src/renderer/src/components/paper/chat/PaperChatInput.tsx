import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AttachedDocument,
  AttachedImage,
  KnowledgeBase,
  LabListItem,
  MCPTool,
  UserInteractionRequest
} from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import type { LabDisciplineId } from '@shared/types/config'
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
  activeLabDiscipline?: LabDisciplineId | null
  activeLabId?: string | null
  enabledDisciplines?: LabDisciplineId[]
  connectedLabs?: LabListItem[]
  isSending: boolean
  disabled?: boolean
  isDragging?: boolean
  quickReply?: PaperChatQuickReply | null
  userInteraction?: UserInteractionRequest | null
  showUserInteraction?: boolean
  showCapabilitySuggestion?: boolean
  capabilitySuggestion?: CapabilitySuggestionData | null
  onUpdateInput: (value: string) => void
  onUpdateSelectedModel: (value: string) => void
  onUpdateSelectedTools: (value: MCPTool[]) => void
  onUpdateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  onUpdateEnableLabTools: (value: boolean) => void
  onUpdateEnablePaperWebSearch: (value: boolean) => void
  onLabSelectionChange?: (next: {
    discipline: LabDisciplineId | null
    labId: string | null
  }) => void
  onNavigateToLab?: () => void
  onRefreshLabs?: () => void
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
  enableLabTools,
  enablePaperWebSearch,
  activeLabDiscipline = null,
  activeLabId = null,
  enabledDisciplines = [],
  connectedLabs = [],
  isSending,
  disabled,
  isDragging = false,
  quickReply,
  userInteraction,
  showUserInteraction,
  showCapabilitySuggestion,
  capabilitySuggestion,
  onUpdateInput,
  onUpdateSelectedModel,
  onUpdateSelectedTools,
  onUpdateSelectedKnowledgeBases,
  onUpdateEnableLabTools,
  onUpdateEnablePaperWebSearch,
  onLabSelectionChange,
  onNavigateToLab,
  onRefreshLabs,
  onEnablePaperWebSearch,
  onDismissQuickReply,
  onHideUserInteraction,
  onHideCapabilitySuggestion,
  onSend,
  onStop
}: PaperChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const [attachmentError, setAttachmentError] = useState('')

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

  // 检查是否有待发送的附件（文档、图片或引文）
  const hasAttachments =
    pendingDocuments.length > 0 || pendingImages.length > 0 || pendingQuotes.length > 0
  const totalAttachmentCount = pendingDocuments.length + pendingImages.length + pendingQuotes.length
  // 允许发送的条件：有消息内容或附件，且不在禁用或发送状态
  const canSend = Boolean(inputMessage.trim() || hasAttachments) && !disabled && !isSending
  // 快速回复面板：AI 给出多个候选回答供用户一键选择
  const showQuickReplyDock = Boolean(quickReply && quickReply.options.length > 0 && !isSending)
  // 能力建议面板：推荐开启某项功能（如联网搜索、实验室）
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
    usePaperChatQuoteStore.getState().initSession(sessionId)
  }, [sessionId])

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
    const quotes = usePaperChatQuoteStore.getState().getPendingQuotesForSending(sessionId)

    // 立即清空输入栏和所有待发送附件，避免异步发送期间的竞态条件
    onUpdateInput('')
    usePaperChatDocumentUploadStore.getState().clearPendingDocuments(sessionId)
    usePaperChatImageUploadStore.getState().clearImages(sessionId)
    usePaperChatQuoteStore.getState().clearQuotes(sessionId)
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
                  {quickReply.question || '\u9009\u62e9\u4e00\u4e2a\u56de\u590d'}
                </span>
                <button
                  className={inputStyles['paper-chat-input__interaction-button']}
                  type="button"
                  onClick={() => onDismissQuickReply?.(quickReply.messageId)}
                >
                  \u81ea\u5b9a\u4e49
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
                  建议开启能力
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
                  忽略
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
                    开启 {cap.displayName}
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
              onSelect={(option) => handleSend(`我选择：${option.value}`)}
              onLater={onHideUserInteraction}
            />
          )}
        </div>
      )}

      {attachmentError && (
        <div className={inputStyles['paper-chat-input__warning']}>
          <span className={inputStyles['paper-chat-input__warning-label']}>\u9644\u4ef6</span>
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
                {quote.viewKind === 'original'
                  ? '\u539f\u6587\u5f15\u7528'
                  : '\u8bd1\u6587\u5f15\u7528'}
              </span>
              <span className={quoteStyles['paper-chat-input__pending-quote-preview']}>
                {quotePreview(quote)}
              </span>
              {quote.surroundingContext?.contextualText.trim() && (
                <span className={quoteStyles['paper-chat-input__pending-quote-context']}>
                  \u4e0a\u4e0b\u6587
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
              ? '\u8f93\u5165\u81ea\u5b9a\u4e49\u56de\u7b54\uff0c\u6216\u70b9\u51fb\u4e0a\u65b9\u5feb\u6377\u9009\u9879 ...'
              : '\u5c3d\u7ba1\u95ee'
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
              <p>\u91ca\u653e\u4ee5\u6dfb\u52a0\u9644\u4ef6</p>
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
          enableLabTools={enableLabTools}
          enablePaperWebSearch={enablePaperWebSearch}
          totalAttachmentCount={totalAttachmentCount}
          activeLabDiscipline={activeLabDiscipline}
          activeLabId={activeLabId}
          enabledDisciplines={enabledDisciplines}
          connectedLabs={connectedLabs}
          onUpdateSelectedTools={onUpdateSelectedTools}
          onUpdateSelectedKnowledgeBases={onUpdateSelectedKnowledgeBases}
          onUpdateEnableLabTools={onUpdateEnableLabTools}
          onTogglePaperWebSearch={() => void togglePaperWebSearch()}
          onLabSelectionChange={onLabSelectionChange}
          onNavigateToLab={onNavigateToLab}
          onRefreshLabs={onRefreshLabs}
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
