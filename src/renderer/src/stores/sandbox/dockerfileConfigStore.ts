import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useDockerfileConfigStore = defineStore('sandboxDockerfileConfig', () => {
  /** Dockerfile 内容 */
  const dockerfileContent = ref('')
  /** Dockerfile 上下文路径 */
  const dockerfileContext = ref('')
  /** Dockerfile 沙箱名称 */
  const dockerfileProjectName = ref('')
  /** 选中的 Dockerfile 配置 ID */
  const selectedDockerfileId = ref<string | null>(null)

  function reset(): void {
    dockerfileContent.value = ''
    dockerfileContext.value = ''
    dockerfileProjectName.value = ''
    selectedDockerfileId.value = null
  }

  return {
    dockerfileContent,
    dockerfileContext,
    dockerfileProjectName,
    selectedDockerfileId,
    reset
  }
})
