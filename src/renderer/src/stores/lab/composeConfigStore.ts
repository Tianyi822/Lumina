import { create } from 'zustand'
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

const defaultGeneratorForm: GeneratorForm = {
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

interface ComposeConfigState {
  composeContent: string
  composeProjectName: string
  selectedComposeId: string | null
  showGenerator: boolean
  generatorForm: GeneratorForm
  composeTemplates: typeof COMPOSE_TEMPLATES
  resetGeneratorForm: () => void
  generateServiceConfig: () => string
  insertServiceConfig: () => void
  reset: () => void
}

export const useComposeConfigStore = create<ComposeConfigState>()((set, get) => ({
  composeContent: '',
  composeProjectName: '',
  selectedComposeId: null,
  showGenerator: false,
  generatorForm: { ...defaultGeneratorForm },
  composeTemplates: COMPOSE_TEMPLATES,

  resetGeneratorForm: () => set({ generatorForm: { ...defaultGeneratorForm } }),

  generateServiceConfig: () => {
    const form = get().generatorForm
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
  },

  insertServiceConfig: () => {
    const config = get().generateServiceConfig()
    const serviceName = get().generatorForm.serviceName.trim() || 'app'
    const currentContent = get().composeContent

    const lines = currentContent.split('\n')
    let inServices = false
    let currentService: string | null = null
    let serviceStartLine = -1
    let serviceEndLine = -1
    let foundService = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.trim() === 'services:') {
        inServices = true
        continue
      }

      if (inServices && line.match(/^[a-zA-Z]/) && !line.startsWith('  ')) {
        inServices = false
      }

      if (inServices) {
        const serviceMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/)
        if (serviceMatch) {
          if (currentService === serviceName && !foundService) {
            serviceEndLine = i
            foundService = true
            break
          }
          currentService = serviceMatch[1]
          if (currentService === serviceName) {
            serviceStartLine = i
            serviceEndLine = -1
          }
        }
      }
    }

    if (currentService === serviceName && serviceEndLine === -1) {
      serviceEndLine = lines.length
      foundService = true
    }

    let newContent: string
    if (foundService && serviceStartLine >= 0) {
      newContent = [
        ...lines.slice(0, serviceStartLine),
        ...config.split('\n'),
        ...lines.slice(serviceEndLine)
      ].join('\n')
    } else {
      const servicesMatch = currentContent.match(/services:\s*\n/m)
      if (servicesMatch && servicesMatch.index !== undefined) {
        const insertIndex = servicesMatch.index + servicesMatch[0].length
        newContent =
          currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
      } else if (currentContent.includes('version:')) {
        newContent = currentContent + '\nservices:\n' + config + '\n'
      } else {
        newContent = "version: '3.8'\n\nservices:\n" + config + '\n'
      }
    }

    set({ composeContent: newContent, showGenerator: false })
    get().resetGeneratorForm()
  },

  reset: () =>
    set({
      composeContent: '',
      composeProjectName: '',
      selectedComposeId: null,
      showGenerator: false,
      generatorForm: { ...defaultGeneratorForm }
    })
}))
