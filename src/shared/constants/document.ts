/**
 * 文档上传与解析共享常量
 */
export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.pdf',
  '.doc',
  '.docx',
  '.csv',
  '.xls',
  '.xlsx',
  '.pptx'
] as const

const SUPPORTED_DOCUMENT_EXTENSION_SET = new Set<string>(SUPPORTED_DOCUMENT_EXTENSIONS)

export const SUPPORTED_DOCUMENT_ACCEPT = SUPPORTED_DOCUMENT_EXTENSIONS.join(',')
export const SUPPORTED_DOCUMENT_LABEL = SUPPORTED_DOCUMENT_EXTENSIONS.join('、')

export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex).toLowerCase()
}

export function isSupportedDocumentExtension(extension: string): boolean {
  return SUPPORTED_DOCUMENT_EXTENSION_SET.has(extension.toLowerCase())
}
