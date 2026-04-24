import type { FileItem } from '@renderer/types'

export function getFileSourceLabel(file: FileItem): string {
  switch (file.sourceKind) {
    case 'paper_file':
      return '论文'
    case 'paper_note':
      return '论文笔记'
    default:
      return '上传文件'
  }
}

export function getFileSourceClass(file: FileItem): string {
  return `source-${file.sourceKind || 'uploaded'}`
}

export function getFileSubtitle(file: FileItem): string {
  if (file.origin?.summary) {
    return file.origin.summary
  }

  if (file.origin?.paperName) {
    return `论文：${file.origin.paperName}`
  }

  return '文件资源池'
}

export function canDeleteFile(file: FileItem): boolean {
  return file.origin?.allowDelete !== false
}

export function canOpenFileExternally(file: FileItem): boolean {
  return file.origin?.allowExternalOpen !== false
}
