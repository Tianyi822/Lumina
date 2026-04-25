/**
 * 提示词模板管理器
 * 负责加载、管理和热更新提示词模板
 */

import type { ReactPromptSections } from './types'
import type { TemplateVariables, TemplateVariableOptions } from '@shared/types/prompt'
import { logger } from '../../logger'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

// 默认提示词模板配置（精简版：只保留模型训练数据中没有的业务特有内容）
const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  version: '2.0.0',
  sections: {
    coreInstructions: `# 角色定义

你是一个专业的 AI 助手，具备强大的推理能力和工具使用能力。你的任务是理解用户需求、合理使用工具、提供结构化且准确的答案。`,

    outputFormat: `# 输出格式要求

1. **语言风格**：使用用户使用的语言（中文或英文），保持专业但友好的语气
2. **结构化表达**：使用清晰的段落和项目符号，代码示例使用代码块格式
3. **注明来源**：如果使用了工具获取信息，简要说明信息来源`,

    sandboxManagement: `# 沙箱管理指南

当用户要求创建沙箱时，按以下流程操作：

1. **确定创建方式**：优先根据用户目标和上下文推断创建方式。常见服务或多服务编排优先使用 Docker Compose；单个自定义运行环境优先使用 Dockerfile；用户明确提到已有容器时才使用 existing。只有无法安全推断且必须由用户做主观选择时，才调用 sandbox__create_sandbox 工具只传 name 参数（不传 creation_type）来展示选项。

2. **收集必要参数**：根据用户选择的方式：
   - **已有容器**：用 sandbox__list_containers 查看可用容器；如果只有一个明显匹配项可直接使用，否则让用户选择
   - **Dockerfile**：根据用户需求生成 Dockerfile 内容；只有缺少不可推断的关键约束时才请用户提供
   - **Docker Compose**：根据用户需求生成 docker-compose.yaml 内容；只有缺少不可推断的关键约束时才请用户提供

3. **执行创建**：参数齐全后，再次调用 sandbox__create_sandbox 带完整参数

注意：
- 尽量先使用合理默认值推进，不要为了普通偏好中断流程
- 必须提问时逐步引导，每次只问1-2个问题
- 对于常见环境（MySQL、Redis、Node.js 等）可主动生成配置内容
- Dockerfile 内容通过 dockerfile_content 参数传递
- Compose 内容通过 compose_content 参数传递`
  },
  variables: {
    fewShotExamples: '{{fewShotExamples}}',
    toolDescriptions: '{{toolDescriptions}}',
    knowledgeContext: '{{knowledgeContext}}'
  }
}

// 提示词模板接口
export interface PromptTemplate {
  version: string
  sections: ReactPromptSections
  variables: Record<string, string>
}

// 模板变更监听器
export type TemplateChangeListener = (template: PromptTemplate) => void

/**
 * 提示词模板管理器
 */
export class PromptTemplateManager {
  private template: PromptTemplate = DEFAULT_PROMPT_TEMPLATE
  private templatePath: string | null = null
  private watchers: TemplateChangeListener[] = []
  private initialized = false

  constructor() {
    this.initialize()
  }

  /**
   * 初始化模板管理器
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // 设置模板文件路径
      const userDataPath = app?.getPath('userData') || process.cwd()
      this.templatePath = path.join(userDataPath, 'prompt-template.json')

      // 尝试加载现有模板
      await this.loadTemplate()

      this.initialized = true
      logger.info('提示词模板管理器初始化成功', 'main')
    } catch (error) {
      logger.error('提示词模板管理器初始化失败', 'main', { error })
      // 使用默认模板继续
      this.template = DEFAULT_PROMPT_TEMPLATE
      this.initialized = true
    }
  }

  /**
   * 获取当前模板
   */
  getTemplate(): PromptTemplate {
    return { ...this.template }
  }

  /**
   * 获取模板版本
   */
  getVersion(): string {
    return this.template.version
  }

  /**
   * 获取指定章节内容
   */
  getSection(sectionName: keyof ReactPromptSections): string {
    return this.template.sections[sectionName] || ''
  }

  /**
   * 更新单个章节
   */
  async updateSection(sectionName: keyof ReactPromptSections, content: string): Promise<boolean> {
    await this.ensureInitialized()

    try {
      this.template.sections[sectionName] = content
      this.template.version = this.incrementVersion(this.template.version)
      await this.saveTemplate()
      this.notifyListeners()
      return true
    } catch (error) {
      logger.error('更新章节失败', 'main', { sectionName, error })
      return false
    }
  }

  /**
   * 批量更新章节
   */
  async updateSections(sections: Partial<ReactPromptSections>): Promise<boolean> {
    await this.ensureInitialized()

    try {
      this.template.sections = { ...this.template.sections, ...sections }
      this.template.version = this.incrementVersion(this.template.version)
      await this.saveTemplate()
      this.notifyListeners()
      return true
    } catch (error) {
      logger.error('批量更新章节失败', 'main', { error })
      return false
    }
  }

  /**
   * 更新整个模板
   */
  async updateTemplate(template: PromptTemplate): Promise<boolean> {
    await this.ensureInitialized()

    try {
      // 验证模板结构
      if (!this.validateTemplate(template)) {
        throw new Error('模板验证失败：缺少必需字段')
      }

      this.template = { ...template }
      await this.saveTemplate()
      this.notifyListeners()
      return true
    } catch (error) {
      logger.error('更新模板失败', 'main', { error })
      return false
    }
  }

  /**
   * 重置为默认模板
   */
  async resetToDefault(): Promise<boolean> {
    await this.ensureInitialized()

    try {
      this.template = { ...DEFAULT_PROMPT_TEMPLATE }
      await this.saveTemplate()
      this.notifyListeners()
      logger.info('模板已重置为默认值', 'main')
      return true
    } catch (error) {
      logger.error('重置模板失败', 'main', { error })
      return false
    }
  }

  /**
   * 导出模板为 JSON 字符串
   */
  exportTemplate(): string {
    return JSON.stringify(this.template, null, 2)
  }

  /**
   * 从 JSON 字符串导入模板
   */
  async importTemplate(json: string): Promise<boolean> {
    await this.ensureInitialized()

    try {
      const template = JSON.parse(json) as PromptTemplate

      if (!this.validateTemplate(template)) {
        throw new Error('导入的模板验证失败')
      }

      this.template = template
      await this.saveTemplate()
      this.notifyListeners()
      return true
    } catch (error) {
      logger.error('导入模板失败', 'main', { error })
      return false
    }
  }

  /**
   * 注册模板变更监听器
   */
  onTemplateChange(listener: TemplateChangeListener): () => void {
    this.watchers.push(listener)

    // 返回取消订阅函数
    return () => {
      const index = this.watchers.indexOf(listener)
      if (index > -1) {
        this.watchers.splice(index, 1)
      }
    }
  }

  /**
   * 获取默认模板
   */
  getDefaultTemplate(): PromptTemplate {
    return { ...DEFAULT_PROMPT_TEMPLATE }
  }

  /**
   * 验证模板结构
   */
  private validateTemplate(template: unknown): template is PromptTemplate {
    if (!template || typeof template !== 'object') return false

    const t = template as PromptTemplate

    // 检查必需字段
    if (!t.version || typeof t.version !== 'string') return false
    if (!t.sections || typeof t.sections !== 'object') return false
    if (!t.variables || typeof t.variables !== 'object') return false

    // 检查必需章节（精简后只保留 coreInstructions 和 outputFormat）
    const requiredSections: (keyof ReactPromptSections)[] = ['coreInstructions', 'outputFormat']

    for (const section of requiredSections) {
      if (typeof t.sections[section] !== 'string') {
        logger.warn(`模板缺少必需章节: ${section}`, 'main')
        return false
      }
    }

    return true
  }

  /**
   * 加载模板文件
   */
  private async loadTemplate(): Promise<void> {
    if (!this.templatePath) return

    try {
      // 检查文件是否存在
      await fs.access(this.templatePath)

      // 读取文件
      const content = await fs.readFile(this.templatePath, 'utf-8')
      const template = JSON.parse(content) as PromptTemplate

      if (this.validateTemplate(template)) {
        this.template = template
        logger.info('提示词模板加载成功', 'main', { version: template.version })
      } else {
        logger.warn('模板验证失败，使用默认模板', 'main')
        this.template = DEFAULT_PROMPT_TEMPLATE
        // 保存默认模板
        await this.saveTemplate()
      }
    } catch {
      // 文件不存在或读取失败，创建默认模板
      logger.info('模板文件不存在，创建默认模板', 'main')
      this.template = DEFAULT_PROMPT_TEMPLATE
      await this.saveTemplate()
    }
  }

  /**
   * 保存模板到文件
   */
  private async saveTemplate(): Promise<void> {
    if (!this.templatePath) return

    try {
      const content = JSON.stringify(this.template, null, 2)
      await fs.writeFile(this.templatePath, content, 'utf-8')
    } catch (error) {
      logger.error('保存模板失败', 'main', { error })
      throw error
    }
  }

  /**
   * 递增版本号
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.')
    if (parts.length === 3) {
      const patch = parseInt(parts[2], 10) + 1
      return `${parts[0]}.${parts[1]}.${patch}`
    }
    return version
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    for (const listener of this.watchers) {
      try {
        listener(this.template)
      } catch (error) {
        logger.error('模板变更监听器执行失败', 'main', { error })
      }
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * 替换模板中的变量占位符
   * 支持 {{variableName}} 格式的变量替换
   */
  replaceTemplateVariables(
    template: string,
    variables: Partial<TemplateVariables>,
    options: TemplateVariableOptions = {}
  ): string {
    const {
      keepUnresolvedPlaceholders = false,
      maxVariableLength = 10000,
      truncateSuffix = '...'
    } = options

    let result = template

    // 定义变量替换的正则表达式
    const variablePattern = /\{\{(\w+)\}\}/g

    result = result.replace(variablePattern, (match, variableName: string) => {
      // 检查变量是否存在
      if (variableName in variables) {
        const value = variables[variableName as keyof TemplateVariables]

        // 处理 null 或 undefined
        if (value === null || value === undefined) {
          return keepUnresolvedPlaceholders ? match : ''
        }

        // 转换为字符串
        let stringValue = String(value)

        // 截断过长的值
        if (stringValue.length > maxVariableLength) {
          stringValue = stringValue.substring(0, maxVariableLength) + truncateSuffix
        }

        return stringValue
      }

      // 变量不存在，根据配置决定是否保留占位符
      return keepUnresolvedPlaceholders ? match : ''
    })

    return result
  }

  /**
   * 获取可用的模板变量列表
   */
  getAvailableVariables(): string[] {
    return [
      'fewShotExamples',
      'toolDescriptions',
      'knowledgeContext',
      'currentDateTime',
      'userLanguage',
      'customInstructions',
      'sessionContext',
      'modelName'
    ]
  }

  /**
   * 构建完整的模板变量对象
   */
  buildTemplateVariables(partial: Partial<TemplateVariables>): TemplateVariables {
    const now = new Date()

    const defaults: TemplateVariables = {
      fewShotExamples: '',
      toolDescriptions: '',
      knowledgeContext: '',
      currentDateTime: now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long'
      }),
      userLanguage: 'zh-CN',
      customInstructions: '',
      sessionContext: '',
      modelName: ''
    }

    return { ...defaults, ...partial }
  }

  /**
   * 在模板内容中应用变量替换
   */
  applyVariablesToSections(
    sections: ReactPromptSections,
    variables: Partial<TemplateVariables>
  ): ReactPromptSections {
    const result: ReactPromptSections = { ...sections }

    for (const key of Object.keys(result) as (keyof ReactPromptSections)[]) {
      if (result[key]) {
        result[key] = this.replaceTemplateVariables(result[key], variables)
      }
    }

    return result
  }
}

// 单例实例
export const promptTemplateManager = new PromptTemplateManager()
