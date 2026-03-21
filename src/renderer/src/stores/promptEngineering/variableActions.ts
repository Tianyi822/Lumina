import type { ComputedRef, Ref } from 'vue'
import type { PromptConfig } from '@shared/types/config'
import type { PromptVariable } from '@shared/types/prompt'
import {
  isReservedPromptVariableName,
  isValidPromptVariableName,
  normalizeCustomPromptVariables
} from '@shared/utils'
import { sanitizeCustomVariableValue } from './utils'

interface PromptEngineeringVariableActionOptions {
  customVariables: ComputedRef<PromptVariable[]>
  error: Ref<string | null>
  updatePromptConfig: (config: Partial<PromptConfig>) => void
  saveConfig: () => Promise<boolean>
}

/** 变量管理 Actions 返回类型 */
interface VariableActions {
  validateVariableName: (name: string, originalName?: string) => string | null
  saveCustomVariable: (
    variable: Pick<PromptVariable, 'name' | 'description' | 'defaultValue'>,
    originalName?: string
  ) => Promise<{ success: boolean; error?: string }>
  deleteCustomVariable: (name: string) => Promise<boolean>
}

/**
 * 创建变量管理 Actions
 */
export function createPromptEngineeringVariableActions(
  options: PromptEngineeringVariableActionOptions
): VariableActions {
  /**
   * 覆盖当前自定义变量并持久化
   */
  async function persistCustomVariables(nextVariables: PromptVariable[]): Promise<boolean> {
    const previousVariables = options.customVariables.value.map((variable) => ({ ...variable }))

    options.updatePromptConfig({
      customVariables: normalizeCustomPromptVariables(nextVariables)
    })

    const saved = await options.saveConfig()
    if (!saved) {
      options.updatePromptConfig({ customVariables: previousVariables })
    }

    return saved
  }

  /**
   * 校验变量名
   */
  function validateVariableName(name: string, originalName?: string): string | null {
    const normalizedName = name.trim()

    if (!normalizedName) {
      return '变量名不能为空'
    }

    if (!isValidPromptVariableName(normalizedName)) {
      return '变量名只能包含字母、数字和下划线，且必须以字母开头'
    }

    if (isReservedPromptVariableName(normalizedName) && normalizedName !== originalName) {
      return `变量名 ${normalizedName} 为系统保留变量`
    }

    const hasDuplicate = options.customVariables.value.some((variable) => {
      if (originalName && variable.name === originalName) {
        return false
      }

      return variable.name === normalizedName
    })

    if (hasDuplicate) {
      return `变量名 ${normalizedName} 已存在`
    }

    return null
  }

  /**
   * 新增或更新自定义变量
   */
  async function saveCustomVariable(
    variable: Pick<PromptVariable, 'name' | 'description' | 'defaultValue'>,
    originalName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const name = variable.name.trim()
    const nameError = validateVariableName(name, originalName)

    if (nameError) {
      options.error.value = nameError
      return { success: false, error: nameError }
    }

    const nextVariable: PromptVariable = {
      name,
      description: variable.description.trim(),
      defaultValue: sanitizeCustomVariableValue(variable.defaultValue),
      type: 'custom',
      category: 'custom',
      editable: true,
      valueType: 'string'
    }

    const nextVariables = options.customVariables.value
      .filter((item) => item.name !== originalName)
      .concat(nextVariable)

    const saved = await persistCustomVariables(nextVariables)
    if (!saved) {
      return { success: false, error: options.error.value || '保存变量失败' }
    }

    return { success: true }
  }

  /**
   * 删除自定义变量
   */
  async function deleteCustomVariable(name: string): Promise<boolean> {
    options.error.value = null
    const nextVariables = options.customVariables.value.filter((variable) => variable.name !== name)
    return persistCustomVariables(nextVariables)
  }

  return {
    validateVariableName,
    saveCustomVariable,
    deleteCustomVariable
  }
}
