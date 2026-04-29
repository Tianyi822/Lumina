/**
 * 前端框架类型
 */
export type FrontendFramework = 'vue' | 'react' | 'vanilla'

/**
 * 前端工作区存储类型
 */
export type FrontendStorageType = 'docker-volume'

/**
 * 前端 bootstrap 状态
 */
export type FrontendBootstrapStatus =
  | 'pending'
  | 'workspace-ready'
  | 'deps-ready'
  | 'runtime-ready'
  | 'build-ready'
  | 'error'

/**
 * 前端 bootstrap 状态摘要
 */
export interface FrontendBootstrapState {
  /** bootstrap 状态 */
  bootstrapStatus: FrontendBootstrapStatus
  /** 工作区是否已初始化 */
  workspaceInitialized: boolean
  /** 依赖是否已安装 */
  dependenciesInstalled: boolean
  /** 是否已完成构建校验 */
  buildValidated?: boolean
  /** 最近一次 bootstrap 时间 */
  lastBootstrapAt?: string
  /** bootstrap 错误摘要 */
  bootstrapError?: string
}

/**
 * 前端工作区元数据
 */
export interface FrontendWorkspaceMetadata extends FrontendBootstrapState {
  /** 框架 */
  framework: FrontendFramework
  /** 工作区存储类型 */
  storageType: FrontendStorageType
  /** Docker volume 名称 */
  volumeName: string
  /** 容器内挂载路径 */
  mountPath: '/workspace'
  /** 项目根目录 */
  projectRoot: string
  /** 包管理器 */
  packageManager: 'bun'
  /** JavaScript 运行时 */
  runtime: 'bun'
  /** 构建器 */
  builder: 'bun'
  /** 容器端口 */
  containerPort: number
  /** 主机端口 */
  hostPort: number
  /** 预览地址 */
  previewUrl: string
}

/**
 * 创建前端实验室选项
 */
export interface CreateFrontendLabOptions {
  /** 实验室名称 */
  name: string
  /** 前端框架 */
  framework?: FrontendFramework
  /** 容器内开发端口，默认 5173 */
  containerPort?: number
  /** 项目根目录，默认 /workspace */
  projectRoot?: string
  /** 是否安装依赖 */
  installDependencies?: boolean
  /** 是否自动启动开发服务器 */
  autoStart?: boolean
}

/**
 * 前端实验室信息
 */
export interface FrontendLabInfo {
  /** 实验室 ID */
  labId: string
  /** 实验室名称 */
  name: string
  /** 框架 */
  framework: FrontendFramework
  /** 容器 ID */
  containerId: string
  /** Docker volume 名称 */
  volumeName: string
  /** 容器内挂载路径 */
  mountPath: '/workspace'
  /** 项目根目录 */
  projectRoot: string
  /** 包管理器 */
  packageManager: 'bun'
  /** JavaScript 运行时 */
  runtime: 'bun'
  /** 构建器 */
  builder: 'bun'
  /** bootstrap 状态 */
  bootstrapStatus: FrontendBootstrapStatus
  /** 是否已完成构建校验 */
  buildValidated?: boolean
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
 * 前端实验室元数据
 */
export type FrontendLabMetadata = FrontendWorkspaceMetadata
