import { storeToRefs } from 'pinia'
import { useSandboxStore } from '@renderer/stores'
import type { Ref } from 'vue'

export type ComposeTemplateType = 'image' | 'build' | 'mixed'

interface GeneratorForm {
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

interface UseComposeGeneratorReturn {
  showGenerator: Ref<boolean>
  generatorForm: Ref<GeneratorForm>
  resetGeneratorForm: () => void
  onSavedDockerfileSelect: () => Promise<void>
  clearSavedDockerfile: () => void
  generateServiceConfig: () => string
  insertServiceConfig: (currentContent: string) => string
  getTemplate: (templateType: ComposeTemplateType) => string
  setShowGenerator: (value: boolean) => void
  toggleGenerator: () => void
}

const composeTemplates: Record<ComposeTemplateType, string> = {
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
}

export function useComposeGenerator(): UseComposeGeneratorReturn {
  const sandboxStore = useSandboxStore()

  const { creatorShowGenerator: showGenerator, creatorGeneratorForm: generatorForm } =
    storeToRefs(sandboxStore)

  function resetGeneratorForm(): void {
    sandboxStore.creatorResetGeneratorForm()
  }

  async function onSavedDockerfileSelect(): Promise<void> {
    await sandboxStore.creatorOnSavedDockerfileSelect()
  }

  function clearSavedDockerfile(): void {
    sandboxStore.creatorClearSavedDockerfile()
  }

  function generateServiceConfig(): string {
    return sandboxStore.creatorGenerateServiceConfig()
  }

  function insertServiceConfig(currentContent: string): string {
    const config = generateServiceConfig()

    const servicesMatch = currentContent.match(/^(services:\s*\n)/m)
    if (servicesMatch) {
      const insertIndex = servicesMatch.index! + servicesMatch[0].length
      return (
        currentContent.slice(0, insertIndex) + config + '\n' + currentContent.slice(insertIndex)
      )
    } else if (currentContent.includes('version:')) {
      return currentContent + '\nservices:\n' + config + '\n'
    } else {
      return "version: '3.8'\n\nservices:\n" + config + '\n'
    }
  }

  function getTemplate(templateType: ComposeTemplateType): string {
    return composeTemplates[templateType]
  }

  function setShowGenerator(value: boolean): void {
    sandboxStore.creatorShowGenerator = value
  }

  function toggleGenerator(): void {
    sandboxStore.creatorShowGenerator = !sandboxStore.creatorShowGenerator
  }

  return {
    showGenerator,
    generatorForm,
    resetGeneratorForm,
    onSavedDockerfileSelect,
    clearSavedDockerfile,
    generateServiceConfig,
    insertServiceConfig,
    getTemplate,
    setShowGenerator,
    toggleGenerator
  }
}
