/**
 * 沙箱重命名 composable
 * 处理沙箱名称的编辑和保存
 */
import { ref, watch, nextTick, type Ref } from 'vue'
import type { SandboxData } from '@shared/types/sandbox'

/** 沙箱重命名 composable 返回值类型 */
export interface UseSandboxRenameReturn {
  isEditing: Ref<boolean>
  editingName: Ref<string>
  startEditing: () => void
  saveName: () => void
  cancelEditing: () => void
  handleKeydown: (event: KeyboardEvent) => void
  handleBlur: () => void
}

export function useSandboxRename(
  currentSandbox: { value: SandboxData | null },
  emit: {
    (e: 'rename', sandboxId: string, newName: string): void
  },
  nameInputRef: Ref<HTMLInputElement | null>
): UseSandboxRenameReturn {
  // 状态
  const isEditing = ref(false)
  const editingName = ref('')

  // 监听沙箱名称变化，更新编辑名称
  watch(
    () => currentSandbox.value?.name,
    () => {
      if (currentSandbox.value && !isEditing.value) {
        editingName.value = currentSandbox.value.name
      }
    },
    { immediate: true }
  )

  /**
   * 开始编辑名称
   */
  function startEditing(): void {
    if (!currentSandbox.value) return
    editingName.value = currentSandbox.value.name
    isEditing.value = true
    nextTick(() => {
      nameInputRef.value?.focus()
      nameInputRef.value?.select()
    })
  }

  /**
   * 保存名称
   */
  function saveName(): void {
    if (!currentSandbox.value) return
    const trimmedName = editingName.value.trim()
    if (trimmedName && trimmedName !== currentSandbox.value.name) {
      emit('rename', currentSandbox.value.sandboxId, trimmedName)
    }
    isEditing.value = false
  }

  /**
   * 取消编辑
   */
  function cancelEditing(): void {
    if (currentSandbox.value) {
      editingName.value = currentSandbox.value.name
    }
    isEditing.value = false
  }

  /**
   * 处理键盘事件
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      cancelEditing()
    } else if (event.key === 'Enter') {
      saveName()
    }
  }

  /**
   * 处理失去焦点事件
   */
  function handleBlur(): void {
    saveName()
  }

  return {
    isEditing,
    editingName,
    startEditing,
    saveName,
    cancelEditing,
    handleKeydown,
    handleBlur
  }
}
