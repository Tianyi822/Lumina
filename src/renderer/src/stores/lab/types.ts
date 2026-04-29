export interface PortMapping {
  hostPort: number | null // null 表示自动分配
  containerPort: number
  protocol: 'tcp' | 'udp'
  editable: boolean // 是否可编辑
}

export type ComposeTemplateType = 'image' | 'build' | 'mixed'

export interface GeneratorForm {
  serviceName: string
  sourceType: 'image' | 'build'
  image: string
  useSavedDockerfile: boolean
  savedDockerfileId: string | null
  context: string
  dockerfile: string
  buildArgs: string
  ports: string
  environment: string
}

export type CreatePhase = 'idle' | 'metadata' | 'building' | 'starting' | 'done'

export type LabCreateType = 'compose' | 'dockerfile' | 'existing'
