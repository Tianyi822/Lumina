import { join, normalize } from 'path'
import { getConfigDirPath } from '../config/configPaths'

export const DOCKER_DIR_NAME = 'docker'
export const DOCKERFILES_DIR_NAME = 'dockerfiles'
export const COMPOSES_DIR_NAME = 'composes'
export const METADATA_FILE_NAME = 'metadata.json'

export function getDockerDirPath(): string {
  return join(getConfigDirPath(), DOCKER_DIR_NAME)
}

export function getDockerfilesDirPath(): string {
  return join(getDockerDirPath(), DOCKERFILES_DIR_NAME)
}

export function getComposesDirPath(): string {
  return join(getDockerDirPath(), COMPOSES_DIR_NAME)
}

export function getDockerMetadataPath(): string {
  return join(getDockerDirPath(), METADATA_FILE_NAME)
}

export function generateDockerfileId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `df-${timestamp}-${random}`
}

export function generateComposeId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `compose-${timestamp}-${random}`
}

export function isValidDockerfileId(id: string): boolean {
  const pattern = /^df-\d+-[a-z0-9]+$/
  if (!pattern.test(id)) return false
  if (id.includes('/') || id.includes('\\') || id.includes('..')) return false
  return true
}

export function isValidComposeId(id: string): boolean {
  const pattern = /^compose-\d+-[a-z0-9]+$/
  if (!pattern.test(id)) return false
  if (id.includes('/') || id.includes('..')) return false
  return true
}

export function isPathInDockerfilesDir(filePath: string): boolean {
  const dockerfilesDir = getDockerfilesDirPath()
  const normalizedPath = normalize(filePath)
  const normalizedDir = normalize(dockerfilesDir)
  return normalizedPath.startsWith(normalizedDir)
}

export function isPathInComposesDir(filePath: string): boolean {
  const composesDir = getComposesDirPath()
  const normalizedPath = normalize(filePath)
  const normalizedDir = normalize(composesDir)
  return normalizedPath.startsWith(normalizedDir)
}
