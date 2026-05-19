import {
  getFileIconInfo,
  getFileIconClass,
  getFileIconName
} from '../shared/composables/useFileIcon'
export type { FileIconInfo } from '../shared/composables/useFileIcon'

export function useFileIcon() {
  return { getFileIconInfo, getFileIconClass, getFileIconName }
}
