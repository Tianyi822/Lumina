import type { PromptVariable } from '@shared/types/prompt'

/**
 * 变量名校验规则
 */
export const PROMPT_VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * 系统内置变量定义
 */
export const SYSTEM_PROMPT_VARIABLES: PromptVariable[] = [
  {
    name: 'current_date',
    description: '当前日期',
    type: 'system',
    evalRule: '运行时按 zh-CN 格式生成当前日期',
    category: 'system',
    editable: false,
    valueType: 'string'
  },
  {
    name: 'current_time',
    description: '当前时间',
    type: 'system',
    evalRule: '运行时按 zh-CN 格式生成当前时间',
    category: 'system',
    editable: false,
    valueType: 'string'
  },
  {
    name: 'current_datetime',
    description: '当前日期时间',
    type: 'system',
    evalRule: '运行时按 zh-CN 格式生成当前日期与时间',
    category: 'system',
    editable: false,
    valueType: 'string'
  }
]

const RESERVED_PROMPT_VARIABLE_NAMES = new Set(
  SYSTEM_PROMPT_VARIABLES.map((variable) => variable.name)
)

/**
 * 获取变量占位符文本
 */
export function getPromptVariablePlaceholder(name: string): string {
  return `{{${name}}}`
}

/**
 * 判断变量名是否符合规则
 */
export function isValidPromptVariableName(name: string): boolean {
  return PROMPT_VARIABLE_NAME_PATTERN.test(name.trim())
}

/**
 * 判断变量名是否为系统保留名
 */
export function isReservedPromptVariableName(name: string): boolean {
  return RESERVED_PROMPT_VARIABLE_NAMES.has(name.trim())
}

/**
 * 清理变量值
 */
export function sanitizePromptVariableValue(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

/**
 * 规范化自定义变量列表
 */
export function normalizeCustomPromptVariables(variables?: PromptVariable[]): PromptVariable[] {
  if (!Array.isArray(variables)) {
    return []
  }

  const normalizedVariables = variables
    .filter((variable) => variable.type === 'custom')
    .map((variable) => {
      const name = variable.name.trim()

      return {
        ...variable,
        name,
        description: variable.description.trim(),
        defaultValue: sanitizePromptVariableValue(variable.defaultValue),
        type: 'custom' as const,
        category: variable.category ?? 'custom',
        editable: variable.editable ?? true,
        valueType: variable.valueType ?? 'string'
      }
    })
    .filter((variable) => isValidPromptVariableName(variable.name))
    .filter((variable) => !isReservedPromptVariableName(variable.name))

  const uniqueVariables = new Map<string, PromptVariable>()
  for (const variable of normalizedVariables) {
    if (!uniqueVariables.has(variable.name)) {
      uniqueVariables.set(variable.name, variable)
    }
  }

  return Array.from(uniqueVariables.values()).sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-CN')
  )
}

/**
 * 获取系统变量定义
 */
export function getSystemPromptVariables(): PromptVariable[] {
  return SYSTEM_PROMPT_VARIABLES.map((variable) => ({ ...variable }))
}

/**
 * 解析系统变量的运行时值
 */
export function resolveSystemPromptVariables(now: Date = new Date()): Record<string, string> {
  return {
    current_date: now.toLocaleDateString('zh-CN'),
    current_time: now.toLocaleTimeString('zh-CN'),
    current_datetime: now.toLocaleString('zh-CN')
  }
}

/**
 * 构建提示词变量值映射
 * 合并顺序：系统变量 < 自定义默认值 < 运行时覆盖值
 */
export function buildPromptVariableValueMap(
  customVariables?: PromptVariable[],
  overrides?: Record<string, string>,
  now: Date = new Date()
): Record<string, string> {
  const resolvedValues = resolveSystemPromptVariables(now)

  for (const variable of normalizeCustomPromptVariables(customVariables)) {
    const defaultValue = sanitizePromptVariableValue(variable.defaultValue)
    if (defaultValue !== undefined) {
      resolvedValues[variable.name] = defaultValue
    }
  }

  for (const [name, value] of Object.entries(overrides ?? {})) {
    const overrideValue = sanitizePromptVariableValue(value)
    if (overrideValue !== undefined) {
      resolvedValues[name] = overrideValue
    }
  }

  return resolvedValues
}

/**
 * 将变量值应用到提示词文本
 */
export function replacePromptVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template

  for (const [name, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), value)
  }

  return result
}
