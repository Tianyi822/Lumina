/**
 * 前端框架类型
 */
export type FrontendFramework = 'vue' | 'react' | 'vanilla'

/**
 * 创建前端沙箱选项
 */
export interface CreateFrontendSandboxOptions {
  /** 沙箱名称 */
  name: string
  /** 前端框架 */
  framework?: FrontendFramework
  /** 容器内开发端口，默认 5173 */
  containerPort?: number
  /** 项目根目录，默认 /app */
  projectRoot?: string
  /** 是否安装依赖 */
  installDependencies?: boolean
  /** 是否自动启动开发服务器 */
  autoStart?: boolean
}

/**
 * 前端沙箱信息
 */
export interface FrontendSandboxInfo {
  /** 沙箱 ID */
  sandboxId: string
  /** 沙箱名称 */
  name: string
  /** 框架 */
  framework: FrontendFramework
  /** 容器 ID */
  containerId: string
  /** 项目根目录 */
  projectRoot: string
  /** 容器端口 */
  containerPort: number
  /** 主机端口 */
  hostPort: number
  /** 预览地址 */
  previewUrl: string
  /** 预览服务是否已就绪 */
  previewReady?: boolean
  /** 启动日志路径 */
  startupLogPath?: string
  /** 补充说明 */
  message?: string
  /** 状态 */
  status: 'creating' | 'running' | 'stopped' | 'error'
}

/**
 * 前端沙箱元数据
 */
export interface FrontendSandboxMetadata {
  /** 框架 */
  framework: FrontendFramework
  /** 项目根目录 */
  projectRoot: string
  /** 容器端口 */
  containerPort: number
  /** 主机端口 */
  hostPort: number
  /** 预览地址 */
  previewUrl: string
}
