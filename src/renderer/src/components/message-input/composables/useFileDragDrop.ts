import { ref, type Ref } from 'vue'
import { isImageFile } from '@renderer/stores/imageUploadStore'
import { IMAGE_ACCEPT_STRING } from '@renderer/utils/imageCompress'

interface UseFileDragDropOptions {
  isSending: () => boolean
  uploadDocuments: (files: File[]) => Promise<string[]>
  addImages: (files: File[]) => Promise<string[]>
}

interface UseFileDragDropReturn {
  isDragging: Ref<boolean>
  handleDragOver: (event: DragEvent) => void
  handleDragLeave: (event: DragEvent) => void
  handleDrop: (event: DragEvent) => Promise<void>
  triggerFileUpload: () => void
}

const FILE_ACCEPT_STRING = `.txt,.md,.pdf,.doc,.docx,.csv,.pptx,${IMAGE_ACCEPT_STRING}`

/**
 * 文件拖拽与选择逻辑
 */
export function useFileDragDrop(options: UseFileDragDropOptions): UseFileDragDropReturn {
  const isDragging = ref(false)

  async function processFiles(files: File[]): Promise<void> {
    const imageFiles: File[] = []
    const docFiles: File[] = []

    for (const file of files) {
      if (isImageFile(file)) {
        imageFiles.push(file)
      } else {
        docFiles.push(file)
      }
    }

    const errors: string[] = []

    if (imageFiles.length > 0) {
      errors.push(...(await options.addImages(imageFiles)))
    }

    if (docFiles.length > 0) {
      errors.push(...(await options.uploadDocuments(docFiles)))
    }

    if (errors.length > 0) {
      alert(errors.join('\n'))
    }
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault()

    if (!options.isSending()) {
      isDragging.value = true
    }
  }

  function handleDragLeave(event: DragEvent): void {
    event.preventDefault()
    isDragging.value = false
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    isDragging.value = false

    if (options.isSending()) {
      return
    }

    const files = Array.from(event.dataTransfer?.files || [])
    await processFiles(files)
  }

  function triggerFileUpload(): void {
    if (options.isSending()) {
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = FILE_ACCEPT_STRING

    input.onchange = async (event) => {
      const files = (event.target as HTMLInputElement).files
      if (!files || files.length === 0) {
        return
      }

      await processFiles(Array.from(files))
    }

    input.click()
  }

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    triggerFileUpload
  }
}
