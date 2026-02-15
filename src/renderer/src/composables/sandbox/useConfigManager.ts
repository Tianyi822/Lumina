import { storeToRefs } from 'pinia'
import { useSandboxStore } from '@renderer/stores'
import type { Ref } from 'vue'

interface UseConfigManagerReturn {
  showSaveDialog: Ref<boolean>
  saveDialogType: Ref<'dockerfile' | 'compose'>
  showSuccessToast: Ref<boolean>
  successMessage: Ref<string>
  openSaveDialog: (type: 'dockerfile' | 'compose') => void
  closeSaveDialog: () => void
  handleSaveConfig: (name: string, content: string, onSuccess?: () => void) => Promise<void>
  closeSuccessToast: () => void
}

export function useConfigManager(): UseConfigManagerReturn {
  const sandboxStore = useSandboxStore()

  const {
    creatorShowSaveDialog: showSaveDialog,
    creatorSaveDialogType: saveDialogType,
    creatorShowSuccessToast: showSuccessToast,
    creatorSuccessMessage: successMessage
  } = storeToRefs(sandboxStore)

  function openSaveDialog(type: 'dockerfile' | 'compose'): void {
    sandboxStore.creatorOpenSaveDialog(type)
  }

  function closeSaveDialog(): void {
    sandboxStore.creatorCloseSaveDialog()
  }

  async function handleSaveConfig(
    name: string,
    content: string,
    onSuccess?: () => void
  ): Promise<void> {
    const dialogType = saveDialogType.value
    const trimmedName = name.trim()

    if (!trimmedName) return

    if (dialogType === 'dockerfile') {
      await sandboxStore.saveDockerfileConfig({
        name: trimmedName,
        content: content
      })
    } else {
      await sandboxStore.saveComposeConfig({
        name: trimmedName,
        content: content
      })
    }

    sandboxStore.creatorShowSaveDialog = false
    sandboxStore.creatorShowSuccessToast = true
    sandboxStore.creatorSuccessMessage = `配置「${trimmedName}」保存成功`
    setTimeout(() => {
      sandboxStore.creatorShowSuccessToast = false
    }, 3000)

    onSuccess?.()
  }

  function closeSuccessToast(): void {
    sandboxStore.creatorCloseSuccessToast()
  }

  return {
    showSaveDialog,
    saveDialogType,
    showSuccessToast,
    successMessage,
    openSaveDialog,
    closeSaveDialog,
    handleSaveConfig,
    closeSuccessToast
  }
}
