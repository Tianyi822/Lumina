/**
 * 文件图标工具
 * 提供文件类型对应的 SvgIcon 名称和颜色
 */

export interface FileIconConfig {
  /** SvgIcon 组件使用的图标名称 */
  name: string
  /** 图标颜色 */
  color: string
}

const FILE_ICONS: Record<string, FileIconConfig> = {
  doc: {
    name: 'file-doc',
    color: '#2B579A'
  },
  docx: {
    name: 'file-doc',
    color: '#2B579A'
  },
  md: {
    name: 'file-md',
    color: '#54A0FF'
  },
  txt: {
    name: 'file-txt',
    color: '#FCCC5A'
  },
  pdf: {
    name: 'file-pdf',
    color: '#FF4242'
  },
  csv: {
    name: 'file-csv',
    color: '#45B058'
  },
  pptx: {
    name: 'file-ppt',
    color: '#D24726'
  },
  ppt: {
    name: 'file-ppt',
    color: '#D24726'
  }
}

const DEFAULT_ICON: FileIconConfig = {
  name: 'file',
  color: 'var(--theme-accent)'
}

/**
 * 获取文件扩展名
 * @param fileName 文件名
 * @returns 文件扩展名（小写，不包含点）
 */
export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex > -1 ? fileName.slice(lastDotIndex + 1).toLowerCase() : ''
}

/**
 * 获取文件类型图标配置
 * @param fileName 文件名
 * @returns 文件图标配置（图标名称和颜色）
 */
export function getFileTypeIcon(fileName: string): FileIconConfig {
  const ext = getFileExtension(fileName)
  return FILE_ICONS[ext] || DEFAULT_ICON
}
