/**
 * 文件图标 composable
 * 提供文件图标相关的通用逻辑
 */

/** 文件图标信息 */
export interface FileIconInfo {
  /** 图标 CSS 类名 */
  iconClass: string
  /** 图标名称（用于 SvgIcon 组件） */
  iconName: string
}

/**
 * 获取文件图标信息
 * @param fileType 文件类型
 * @returns 图标信息
 */
export function getFileIconInfo(fileType: string): FileIconInfo {
  const type = fileType.toLowerCase()
  switch (type) {
    case 'pdf':
      return { iconClass: 'file-icon-pdf', iconName: 'file-pdf' }
    case 'txt':
      return { iconClass: 'file-icon-txt', iconName: 'file-txt' }
    case 'md':
      return { iconClass: 'file-icon-md', iconName: 'file-md' }
    case 'doc':
    case 'docx':
      return { iconClass: 'file-icon-doc', iconName: 'file-doc' }
    case 'csv':
      return { iconClass: 'file-icon-csv', iconName: 'file-csv' }
    default:
      return { iconClass: 'file-icon-default', iconName: 'file' }
  }
}

/**
 * 获取文件图标 CSS 类名
 * @param fileType 文件类型
 * @returns CSS 类名
 */
export function getFileIconClass(fileType: string): string {
  return getFileIconInfo(fileType).iconClass
}

/**
 * 获取文件图标名称
 * @param fileType 文件类型
 * @returns 图标名称
 */
export function getFileIconName(fileType: string): string {
  return getFileIconInfo(fileType).iconName
}

/**
 * useFileIcon composable
 * 封装文件图标相关逻辑
 */
export function useFileIcon(): {
  getFileIconInfo: (fileType: string) => FileIconInfo
  getFileIconClass: (fileType: string) => string
  getFileIconName: (fileType: string) => string
} {
  return {
    getFileIconInfo,
    getFileIconClass,
    getFileIconName
  }
}
