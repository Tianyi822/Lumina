import SvgIcon from '@renderer/components/icons/SvgIcon'
import { getFileTypeIcon } from '@renderer/utils/fileIcons'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { formatFileSize } from '@shared/utils'
import styles from './PaperChatMessageAttachments.module.css'

interface PaperChatMessageAttachmentsProps {
  attachments: {
    documents?: Message['attachedDocuments']
    images?: Message['attachedImages']
    quotes?: PaperQuote[]
  }
  onQuoteClick?: (quote: PaperQuote) => void
}

const QUOTE_PREVIEW_MAX_LENGTH = 42

/** 生成引文的显示标签，按视图类型（原文/译文）独立编号 */
function getQuoteLabel(quotes: PaperQuote[], quote: PaperQuote, index: number): string {
  const quoteIndex = quotes
    .slice(0, index + 1)
    .filter((item) => item.viewKind === quote.viewKind).length
  const viewLabel = quote.viewKind === 'original' ? '原文引用' : '译文引用'
  return `${viewLabel} ${quoteIndex}`
}

/** 截取引文选中文本的前 42 个字符作为预览 */
function getQuotePreview(quote: PaperQuote): string {
  const normalizedText = quote.selectedText.replace(/\s+/g, ' ').trim()
  if (normalizedText.length <= QUOTE_PREVIEW_MAX_LENGTH) {
    return normalizedText
  }
  return `${normalizedText.slice(0, QUOTE_PREVIEW_MAX_LENGTH)}...`
}

/** 消息附件展示组件，以徽章状卡片呈现文档、引文和图片三种附件 */
export default function PaperChatMessageAttachments({
  attachments,
  onQuoteClick
}: PaperChatMessageAttachmentsProps) {
  const documents = attachments.documents || []
  const images = attachments.images || []
  const quotes = attachments.quotes || []
  const hasAttachments = documents.length > 0 || images.length > 0 || quotes.length > 0

  if (!hasAttachments) {
    return null
  }

  return (
    <div>
      {documents.length > 0 && (
        <div className={styles['document-indicators']}>
          {documents.map((doc, index) => {
            const icon = getFileTypeIcon(doc.fileName)
            return (
              <div key={`${doc.fileName}-${index}`} className={styles['doc-badge']}>
                <SvgIcon
                  className={styles['doc-icon']}
                  name={icon.name}
                  size={14}
                  color={icon.color}
                />
                <span className={styles['doc-name']} title={doc.fileName}>
                  {doc.fileName}
                </span>
                <span className={styles['doc-size']}>{formatFileSize(doc.fileSize)}</span>
              </div>
            )
          })}
        </div>
      )}

      {quotes.length > 0 && (
        <div className={styles['quote-indicators']}>
          {quotes.map((quote, index) => (
            <button
              key={quote.id}
              className={styles['quote-badge']}
              type="button"
              onClick={() => onQuoteClick?.(quote)}
            >
              <SvgIcon className={styles['quote-badge__icon']} name="quote" size={12} />
              <span className={styles['quote-badge__label']}>
                {getQuoteLabel(quotes, quote, index)}
              </span>
              <span className={styles['quote-badge__preview']} title={quote.selectedText}>
                {getQuotePreview(quote)}
              </span>
              {quote.surroundingContext?.contextualText.trim() && (
                <span className={styles['quote-badge__context']}>上下文</span>
              )}
            </button>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className={styles['image-indicators']}>
          {images.map((image, index) => (
            <div key={`${image.fileName}-${index}`} className={styles['image-badge']}>
              <img
                className={styles['msg-image-thumb']}
                src={image.base64Data}
                alt={image.fileName}
              />
              <span className={styles['image-badge-name']} title={image.fileName}>
                {image.fileName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
