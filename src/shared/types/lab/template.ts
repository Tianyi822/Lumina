import type { FrontendFramework } from './frontend'

/**
 * 模板文件
 */
export interface TemplateFile {
  /** 相对于项目根目录的路径 */
  path: string
  /** 文件内容 */
  content: string
}

/**
 * 前端项目模板
 */
export interface ProjectTemplate {
  /** 模板 ID */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 框架 */
  framework: FrontendFramework
  /** 包管理器 */
  packageManager: 'bun'
  /** 安装命令 */
  installCommand: string
  /** 启动命令 */
  startCommand: string
  /** 构建命令 */
  buildCommand: string
  /** 模板文件 */
  files: TemplateFile[]
}

/**
 * 模板变量
 */
export interface TemplateVariables {
  /** 项目名 */
  projectName: string
  /** 扩展变量 */
  [key: string]: string
}
