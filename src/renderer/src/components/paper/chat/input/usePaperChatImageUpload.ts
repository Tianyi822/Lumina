import { computed, type ComputedRef } from 'vue'
import {
  usePaperChatImageUploadStore,
  type PendingImage
} from '@renderer/stores/paperChatImageUploadStore'

interface UseImageUploadReturn {
  pendingImages: ComputedRef<PendingImage[]>
  addImages: (files: File[]) => Promise<string[]>
  removePendingImage: (index: number) => void
  clearPendingImages: () => void
}

/**
 * 图片上传逻辑
 */
export function usePaperChatImageUpload(sessionId: ComputedRef<string>): UseImageUploadReturn {
  const imageStore = usePaperChatImageUploadStore()
  const pendingImages = computed(() => imageStore.getSessionImages(sessionId.value))

  async function addImages(files: File[]): Promise<string[]> {
    const result = await imageStore.addImages(sessionId.value, files)
    return result.errors
  }

  function removePendingImage(index: number): void {
    imageStore.removeImage(sessionId.value, index)
  }

  function clearPendingImages(): void {
    imageStore.clearImages(sessionId.value)
  }

  return {
    pendingImages,
    addImages,
    removePendingImage,
    clearPendingImages
  }
}
