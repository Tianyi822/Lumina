import {
  getFileIconInfo,
  getFileIconClass,
  getFileIconName
} from '../shared/composables/useFileIcon'
export type { FileIconInfo } from '../shared/composables/useFileIcon'

/** 文件图标工具 Hook，封装图标的 SVG 名称、CSS 类名和信息获取 */
export function useFileIcon() {
  return { getFileIconInfo, getFileIconClass, getFileIconName }
}
