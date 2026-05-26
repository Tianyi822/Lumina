import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { LabService } from './LabService'
import { getLabDirPath } from './labPaths'
import { getDockerService } from './docker/DockerService'
import type { ContainerInfo, LabData } from '@shared/types/lab'

function createDockerError(
  message: string,
  statusCode: number
): Error & {
  statusCode: number
  reason: string
} {
  return Object.assign(new Error(message), {
    statusCode,
    reason: message
  })
}

function createLab(overrides: Partial<LabData> = {}): LabData {
  return {
    labId: 'lab-1778054811882-c8v2zfkd',
    name: '前端实验室',
    status: 'running',
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    creationType: 'dockerfile',
    containerIds: ['container-1'],
    primaryContainerId: 'container-1',
    isOrphan: false,
    backendType: 'docker',
    ...overrides
  }
}

function createContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'container-1',
    shortId: 'container-1'.substring(0, 12),
    names: ['frontend'],
    image: 'node:20',
    state: 'running',
    status: 'Up 1 minute',
    ports: [],
    created: 1778054811,
    labels: {},
    ...overrides
  }
}

function resetLabDir(): void {
  const labDir = getLabDirPath()
  if (existsSync(labDir)) {
    rmSync(labDir, { recursive: true, force: true })
  }
}

test('LabService 检查状态时 Docker 临时错误不会写入孤儿状态', async (t) => {
  resetLabDir()
  const service = new LabService()
  const lab = createLab()
  assert.equal(service.saveLab(lab, { silent: true }).success, true)

  const dockerService = getDockerService()
  const originalListContainers = dockerService.listContainers
  dockerService.listContainers = (async () => {
    throw createDockerError('server error', 500)
  }) as typeof dockerService.listContainers

  t.after(() => {
    dockerService.listContainers = originalListContainers
    resetLabDir()
  })

  const status = await service.checkContainerStatus(lab.labId)
  const reloaded = service.loadLab(lab.labId, { silent: true })

  assert.equal(status, null)
  assert.equal(reloaded?.isOrphan, false)
  assert.equal(reloaded?.status, 'running')
  assert.deepEqual(reloaded?.containerIds, ['container-1'])
})

test('LabService 仅在容器快照成功且容器缺失时标记孤儿', async (t) => {
  resetLabDir()
  const service = new LabService()
  const lab = createLab()
  assert.equal(service.saveLab(lab, { silent: true }).success, true)

  const dockerService = getDockerService()
  const originalListContainers = dockerService.listContainers
  dockerService.listContainers = (async () => []) as typeof dockerService.listContainers

  t.after(() => {
    dockerService.listContainers = originalListContainers
    resetLabDir()
  })

  const status = await service.checkContainerStatus(lab.labId)
  const reloaded = service.loadLab(lab.labId, { silent: true })

  assert.equal(status?.isOrphan, true)
  assert.equal(reloaded?.isOrphan, true)
  assert.equal(reloaded?.status, 'error')
  assert.deepEqual(reloaded?.containerIds, ['container-1'])
})

test('LabService 在容器重新出现时清除孤儿标记', async (t) => {
  resetLabDir()
  const service = new LabService()
  const lab = createLab({
    status: 'error',
    isOrphan: true
  })
  assert.equal(service.saveLab(lab, { silent: true }).success, true)

  const dockerService = getDockerService()
  const originalListContainers = dockerService.listContainers
  dockerService.listContainers = (async () => [
    createContainer()
  ]) as typeof dockerService.listContainers

  t.after(() => {
    dockerService.listContainers = originalListContainers
    resetLabDir()
  })

  const status = await service.checkContainerStatus(lab.labId)
  const reloaded = service.loadLab(lab.labId, { silent: true })

  assert.equal(status?.isOrphan, false)
  assert.equal(reloaded?.isOrphan, false)
  assert.equal(reloaded?.status, 'running')
})
