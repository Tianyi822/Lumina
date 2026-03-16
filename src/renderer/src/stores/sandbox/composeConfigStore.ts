import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { GeneratorForm } from './types'

const COMPOSE_TEMPLATES = {
  image: `version: '3.8'

services:
  app:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./:/app
    command: sh -c "npm install && npm start"
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
`,
  build: `version: '3.8'

services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
`,
  mixed: `version: '3.8'

services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
`
} as const

export const useComposeConfigStore = defineStore('sandboxComposeConfig', () => {
  /** Compose 内容 */
  const composeContent = ref('')
  /** Compose 项目名称 */
  const composeProjectName = ref('')
  /** 选中的 Compose 配置 ID */
  const selectedComposeId = ref<string | null>(null)

  /** 构建配置生成器显示状态 */
  const showGenerator = ref(false)
  /** 构建配置生成器表单 */
  const generatorForm = ref<GeneratorForm>({
    serviceName: 'app',
    sourceType: 'build',
    image: 'node:18-alpine',
    useSavedDockerfile: false,
    savedDockerfileId: null,
    context: './app',
    dockerfile: 'Dockerfile',
    buildArgs: '',
    ports: '3000:3000',
    environment: 'NODE_ENV=development'
  })

  function resetGeneratorForm(): void {
    generatorForm.value = {
      serviceName: 'app',
      sourceType: 'build',
      image: 'node:18-alpine',
      useSavedDockerfile: false,
      savedDockerfileId: null,
      context: './app',
      dockerfile: 'Dockerfile',
      buildArgs: '',
      ports: '3000:3000',
      environment: 'NODE_ENV=development'
    }
  }

  function generateServiceConfig(): string {
    const form = generatorForm.value
    const lines: string[] = []
    const indent = '    '

    lines.push(`  ${form.serviceName}:`)

    if (form.sourceType === 'image') {
      lines.push(`${indent}image: ${form.image}`)
    } else {
      lines.push(`${indent}build:`)
      lines.push(`${indent}  context: ${form.context}`)
      if (form.dockerfile && form.dockerfile !== 'Dockerfile') {
        lines.push(`${indent}  dockerfile: ${form.dockerfile}`)
      }
      if (form.buildArgs.trim()) {
        const args = form.buildArgs
          .split(',')
          .map((arg) => arg.trim())
          .filter(Boolean)
        if (args.length > 0) {
          lines.push(`${indent}  args:`)
          args.forEach((arg) => {
            const [key, value] = arg.split('=').map((s) => s.trim())
            if (key && value) {
              lines.push(`${indent}    ${key}: ${value}`)
            }
          })
        }
      }
    }

    if (form.ports.trim()) {
      const ports = form.ports
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      if (ports.length > 0) {
        lines.push(`${indent}ports:`)
        ports.forEach((port) => {
          lines.push(`${indent}  - "${port}"`)
        })
      }
    }

    if (form.environment.trim()) {
      const envs = form.environment
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
      if (envs.length > 0) {
        lines.push(`${indent}environment:`)
        envs.forEach((env) => {
          lines.push(`${indent}  - ${env}`)
        })
      }
    }

    return lines.join('\n')
  }

  function insertServiceConfig(): void {
    const config = generateServiceConfig()
    const serviceName = generatorForm.value.serviceName.trim() || 'app'
    const currentContent = composeContent.value

    // 解析现有内容，查找并替换已存在的服务
    const lines = currentContent.split('\n')
    let inServices = false
    let currentService: string | null = null
    let serviceStartLine = -1
    let serviceEndLine = -1
    let foundService = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 检测 services 块开始
      if (line.trim() === 'services:') {
        inServices = true
        continue
      }

      // 检测其他顶级块（退出 services 块）
      if (inServices && line.match(/^[a-zA-Z]/) && !line.startsWith('  ')) {
        inServices = false
        if (foundService) break
      }

      if (inServices) {
        // 检测服务定义（2空格缩进 + 服务名 + 冒号）
        const serviceMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/)
        if (serviceMatch) {
          // 如果之前找到了目标服务，记录结束位置
          if (currentService === serviceName && !foundService) {
            serviceEndLine = i
            foundService = true
          }
          currentService = serviceMatch[1]
          if (currentService === serviceName) {
            serviceStartLine = i
            serviceEndLine = -1
          }
        }
      }
    }

    // 如果找到了目标服务但没设置结束位置，说明是最后一个服务
    if (currentService === serviceName && serviceEndLine === -1) {
      serviceEndLine = lines.length
      foundService = true
    }

    if (foundService && serviceStartLine >= 0) {
      // 替换已存在的服务
      const newLines = [
        ...lines.slice(0, serviceStartLine),
        ...config.split('\n'),
        ...lines.slice(serviceEndLine)
      ]
      composeContent.value = newLines.join('\n')
    } else {
      // 服务不存在，插入新配置
      const servicesMatch = currentContent.match(/services:\s*\n/m)
      if (servicesMatch && servicesMatch.index !== undefined) {
        const insertIndex = servicesMatch.index + servicesMatch[0].length
        composeContent.value =
          currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
      } else if (currentContent.includes('version:')) {
        composeContent.value = currentContent + '\nservices:\n' + config + '\n'
      } else {
        composeContent.value = "version: '3.8'\n\nservices:\n" + config + '\n'
      }
    }

    showGenerator.value = false
    resetGeneratorForm()
  }

  function reset(): void {
    composeContent.value = ''
    composeProjectName.value = ''
    selectedComposeId.value = null
    showGenerator.value = false
    resetGeneratorForm()
  }

  return {
    composeContent,
    composeProjectName,
    selectedComposeId,
    showGenerator,
    generatorForm,
    composeTemplates: COMPOSE_TEMPLATES,
    resetGeneratorForm,
    generateServiceConfig,
    insertServiceConfig,
    reset
  }
})
