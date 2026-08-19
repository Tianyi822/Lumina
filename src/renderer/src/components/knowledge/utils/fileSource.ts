import { i18n } from '@renderer/i18n'
import type { FileItem } from '@renderer/types'

/** 根据文件来源类型获取本地化标签（论文/论文笔记/上传文件） */
export function getFileSourceLabel(file: FileItem): string {
  switch (file.sourceKind) {
    case 'paper_file':
      return i18n.t('knowledge.fileSource.paper')
    case 'paper_note':
      return i18n.t('knowledge.fileSource.paperNote')
    default:
      return i18n.t('knowledge.fileSource.uploadedFile')
  }
}

/** 根据文件来源类型获取 CSS 类名 */
export function getFileSourceClass(file: FileItem): string {
  return `source-${file.sourceKind || 'uploaded'}`
}

/** 获取文件副标题：优先使用来源摘要、论文名称，最后回退至文件资源池 */
export function getFileSubtitle(file: FileItem): string {
  if (file.origin?.summary) {
    return file.origin.summary
  }

  if (file.origin?.paperName) {
    return i18n.t('knowledge.fileSource.paperWithName', { name: file.origin.paperName })
  }

  return i18n.t('knowledge.common.poolLabel')
}

/** 判断文件是否允许删除 */
export function canDeleteFile(file: FileItem): boolean {
  return file.origin?.allowDelete !== false
}

/** 判断文件是否允许外部程序打开 */
export function canOpenFileExternally(file: FileItem): boolean {
  return file.origin?.allowExternalOpen !== false
}
