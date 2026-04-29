import type { FrontendFramework, ProjectTemplate, TemplateVariables } from '@shared/types/lab'
import { reactTemplate } from './reactTemplate'
import { vanillaTemplate } from './vanillaTemplate'
import { vueTemplate } from './vueTemplate'

/**
 * 模板服务
 * 负责按框架返回模板并完成变量渲染
 */
export class TemplateService {
  /**
   * 获取指定框架模板
   */
  getTemplate(framework: FrontendFramework): ProjectTemplate {
    switch (framework) {
      case 'vue':
        return vueTemplate
      case 'react':
        return reactTemplate
      case 'vanilla':
        return vanillaTemplate
      default:
        throw new Error(`不支持的前端框架: ${framework}`)
    }
  }

  /**
   * 渲染模板
   */
  renderTemplate(framework: FrontendFramework, variables: TemplateVariables): ProjectTemplate {
    const template = this.getTemplate(framework)

    return {
      ...template,
      name: this.renderString(template.name, variables),
      description: this.renderString(template.description, variables),
      installCommand: this.renderString(template.installCommand, variables),
      startCommand: this.renderString(template.startCommand, variables),
      buildCommand: this.renderString(template.buildCommand, variables),
      files: template.files.map((file) => ({
        ...file,
        content: this.renderString(file.content, variables)
      }))
    }
  }

  /**
   * 渲染字符串变量
   */
  private renderString(content: string, variables: TemplateVariables): string {
    let rendered = content

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${this.escapeRegExp(key)}\\s*\\}\\}`, 'g')
      rendered = rendered.replace(pattern, value)
    }

    return rendered
  }

  /**
   * 转义正则特殊字符
   */
  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
