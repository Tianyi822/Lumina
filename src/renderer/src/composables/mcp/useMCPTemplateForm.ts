import { reactive, ref, toRaw } from 'vue'
import type { MCPServerConfig } from '@renderer/types'

export function useMCPTemplateForm(): {
  showForm: ReturnType<typeof ref<boolean>>
  formData: MCPServerConfig
  argsText: ReturnType<typeof ref<string>>
  envText: ReturnType<typeof ref<string>>
  headersText: ReturnType<typeof ref<string>>
  parseKeyValueText: (text: string) => Record<string, string>
  keyValueToText: (obj: Record<string, string>) => string
  buildConfig: () => MCPServerConfig
  validateConfig: (config: MCPServerConfig, existingNames: string[]) => string | null
  resetForm: () => void
  openForm: () => void
} {
  const showForm = ref(false)

  // 新 MCP 服务器表单
  const formData = reactive<MCPServerConfig>({
    name: '',
    transport: 'stdio',
    enabled: true,
    command: '',
    args: [],
    env: {},
    url: '',
    headers: {}
  })

  const argsText = ref('')
  const envText = ref('')
  const headersText = ref('')

  /**
   * 解析键值对文本
   */
  function parseKeyValueText(text: string): Record<string, string> {
    const result: Record<string, string> = {}
    const lines = text.split('\n').filter((line) => line.trim())
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join('=').trim()
      }
    }
    return result
  }

  /**
   * 将键值对对象转换为文本
   */
  function keyValueToText(obj: Record<string, string>): string {
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }

  /**
   * 构建配置对象
   */
  function buildConfig(): MCPServerConfig {
    return {
      ...toRaw(formData),
      args: argsText.value
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s),
      env: parseKeyValueText(envText.value),
      headers: parseKeyValueText(headersText.value)
    }
  }

  /**
   * 验证配置
   */
  function validateConfig(config: MCPServerConfig, existingNames: string[]): string | null {
    if (!config.name.trim()) {
      return '请输入服务器名称'
    }

    if (existingNames.some((c) => c === config.name)) {
      return '该名称已存在'
    }

    if (config.transport === 'stdio') {
      if (!config.command?.trim()) {
        return '请输入执行命令'
      }
    } else {
      if (!config.url?.trim()) {
        return '请输入服务地址'
      }
    }

    return null
  }

  /**
   * 重置表单
   */
  function resetForm(): void {
    showForm.value = false
    formData.name = ''
    formData.transport = 'stdio'
    formData.enabled = true
    formData.command = ''
    formData.args = []
    formData.env = {}
    formData.url = ''
    formData.headers = {}
    argsText.value = ''
    envText.value = ''
    headersText.value = ''
  }

  /**
   * 显示表单
   */
  function openForm(): void {
    showForm.value = true
  }

  return {
    showForm,
    formData,
    argsText,
    envText,
    headersText,
    parseKeyValueText,
    keyValueToText,
    buildConfig,
    validateConfig,
    resetForm,
    openForm
  }
}
