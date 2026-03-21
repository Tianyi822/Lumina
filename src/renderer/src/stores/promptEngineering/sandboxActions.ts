import type { TestPromptPayload } from '@shared/types/prompt'
import type { PromptEngineeringStoreRefs, VariableOverrides } from './types'
import {
  buildSandboxPayload,
  getErrorMessage,
  sanitizeVariableOverrides,
  startScopedLoading,
  stopScopedLoading
} from './utils'

/** 测试沙盘 Actions 返回类型 */
interface SandboxActions {
  setVariableOverrides: (overrides: VariableOverrides) => void
  updateVariableOverride: (name: string, value: string) => void
  clearVariableOverrides: () => void
  previewPrompt: (payload: TestPromptPayload) => Promise<boolean>
  runSandboxTest: (payload: TestPromptPayload) => Promise<boolean>
  clearSandboxResult: () => void
}

/**
 * 创建测试沙盘 Actions
 */
export function createPromptEngineeringSandboxActions(
  store: PromptEngineeringStoreRefs
): SandboxActions {
  /**
   * 设置变量覆盖值
   */
  function setVariableOverrides(overrides: VariableOverrides): void {
    store.variableOverrides.value = sanitizeVariableOverrides(overrides)
  }

  /**
   * 更新单个变量覆盖值
   */
  function updateVariableOverride(name: string, value: string): void {
    const nextOverrides = { ...store.variableOverrides.value }

    if (value.trim() === '') {
      delete nextOverrides[name]
    } else {
      nextOverrides[name] = value
    }

    store.variableOverrides.value = nextOverrides
  }

  /**
   * 清除变量覆盖值
   */
  function clearVariableOverrides(): void {
    store.variableOverrides.value = {}
  }

  /**
   * 预览组装后的提示词（不调用模型）
   */
  async function previewPrompt(payload: TestPromptPayload): Promise<boolean> {
    startScopedLoading(store.sandboxLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.previewPrompt(buildSandboxPayload(payload))
      if (!result.success || !result.prompt) {
        store.error.value = result.error || '预览提示词失败'
        return false
      }

      store.assembledPrompt.value = result.prompt
      return true
    } catch (target) {
      store.error.value = getErrorMessage('预览提示词失败', target)
      return false
    } finally {
      stopScopedLoading(store.sandboxLoadingCounter)
    }
  }

  /**
   * 执行测试（调用模型）
   */
  async function runSandboxTest(payload: TestPromptPayload): Promise<boolean> {
    startScopedLoading(store.sandboxLoadingCounter)
    store.error.value = null
    store.sandboxResult.value = null
    store.sandboxTesting.value = true

    try {
      const result = await window.api.promptEngineering.testPrompt(buildSandboxPayload(payload))
      store.sandboxResult.value = result

      if (!result.success) {
        store.error.value = result.error || '测试执行失败'
        return false
      }

      if (result.assembledPrompt) {
        store.assembledPrompt.value = result.assembledPrompt
      }

      return true
    } catch (target) {
      const errorMessage = getErrorMessage('测试执行失败', target)
      store.error.value = errorMessage
      store.sandboxResult.value = {
        success: false,
        error: errorMessage
      }
      return false
    } finally {
      store.sandboxTesting.value = false
      stopScopedLoading(store.sandboxLoadingCounter)
    }
  }

  /**
   * 清除测试结果
   */
  function clearSandboxResult(): void {
    store.sandboxResult.value = null
    store.assembledPrompt.value = ''
    store.sandboxTesting.value = false
  }

  return {
    setVariableOverrides,
    updateVariableOverride,
    clearVariableOverrides,
    previewPrompt,
    runSandboxTest,
    clearSandboxResult
  }
}
