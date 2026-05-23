import test from 'node:test'
import assert from 'node:assert/strict'
import { useLabStore } from './labStore'
import { useLabListStore } from './labListStore'
import { useContainerStore } from './containerStore'
import { useComposeConfigStore } from './composeConfigStore'
import { useDockerfileConfigStore } from './dockerfileConfigStore'
import { useLabCreatorStore } from './creatorStore'
import { usePortMappingStore } from './portMappingStore'
import type { ContainerDetails, LabData, LabListItem } from '@renderer/types/lab'

function createSshLab(status: LabData['status']): LabData {
  return {
    labId: 'lab-ssh-refresh',
    name: 'root@example',
    status,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    creationType: 'ssh',
    containerIds: [],
    isOrphan: false,
    backendType: 'ssh',
    ssh: {
      host: 'example.com',
      port: 22,
      username: 'root',
      authType: 'key',
      connected: status === 'running'
    }
  }
}

function createLabListItem(lab: LabData): LabListItem {
  return {
    labId: lab.labId,
    name: lab.name,
    status: lab.status,
    createdAt: lab.createdAt,
    updatedAt: lab.updatedAt,
    creationType: lab.creationType,
    containerCount: 0,
    isOrphan: false
  }
}

function createContainerDetails(id: string): ContainerDetails {
  return {
    id,
    shortId: id.substring(0, 12),
    names: ['frontend'],
    image: 'node:20',
    state: 'running',
    status: 'Up 1 minute',
    ports: [],
    created: 1778054811,
    labels: {},
    hostConfig: {
      memory: 0,
      cpuShares: 0,
      cpuQuota: 0,
      restartPolicy: 'no',
      privileged: false
    },
    networkSettings: {
      networks: {},
      ports: {}
    },
    mounts: [],
    env: [],
    cmd: [],
    workingDir: '/app',
    entrypoint: []
  }
}

test('connectSsh 成功后强制刷新当前 SSH 实验室详情', async (t) => {
  const stoppedLab = createSshLab('stopped')
  const runningLab = createSshLab('running')
  let loadLabResolvedCount = 0
  const testGlobal = globalThis as unknown as { window?: Window }
  const originalWindow = testGlobal.window

  testGlobal.window = {
    api: {
      ssh: {
        connect: async () => ({ success: true, status: 'connected' }),
        disconnect: async () => ({ success: true })
      },
      lab: {
        listLabs: async () => [createLabListItem(runningLab)],
        loadLabResolved: async () => {
          loadLabResolvedCount++
          return runningLab
        },
        readLabLog: async () => []
      },
      logger: {
        debug: async () => ({ success: true }),
        info: async () => ({ success: true }),
        warn: async () => ({ success: true }),
        error: async () => ({ success: true })
      }
    }
  } as unknown as Window

  t.after(() => {
    if (originalWindow) {
      testGlobal.window = originalWindow
    } else {
      delete testGlobal.window
    }
  })

  // Zustand: 直接设置 labListStore 中的 currentLab
  useLabListStore.setState({ currentLab: stoppedLab })

  const connected = await useLabStore.getState().connectSsh(stoppedLab.labId, {
    host: 'example.com',
    port: 22,
    username: 'root',
    authType: 'key',
    keyName: 'id_rsa'
  })

  assert.equal(connected, true)
  assert.equal(loadLabResolvedCount, 1)
  assert.equal(useLabListStore.getState().currentLab?.status, 'running')
  assert.equal(useLabListStore.getState().currentLab?.ssh?.connected, true)
})

test('loadContainerDetails 遇到 Docker 临时错误时保留当前容器', async (t) => {
  const testGlobal = globalThis as unknown as { window?: Window }
  const originalWindow = testGlobal.window
  const selectedContainer = createContainerDetails('container-1')

  testGlobal.window = {
    api: {
      lab: {
        getContainerDetails: async () => ({
          success: false,
          error: 'server error',
          reason: 'docker_server_error'
        })
      },
      logger: {
        debug: async () => ({ success: true }),
        info: async () => ({ success: true }),
        warn: async () => ({ success: true }),
        error: async () => ({ success: true })
      }
    }
  } as unknown as Window

  t.after(() => {
    if (originalWindow) {
      testGlobal.window = originalWindow
    } else {
      delete testGlobal.window
    }
    useContainerStore.setState({ selectedContainer: null })
  })

  useContainerStore.setState({ selectedContainer })

  const loaded = await useContainerStore
    .getState()
    .loadContainerDetails(selectedContainer.id, { silent: true })

  assert.equal(loaded, false)
  assert.equal(useContainerStore.getState().selectedContainer?.id, selectedContainer.id)
})

test('loadContainerDetails 遇到 not_found 时清空当前容器', async (t) => {
  const testGlobal = globalThis as unknown as { window?: Window }
  const originalWindow = testGlobal.window
  const selectedContainer = createContainerDetails('container-1')

  testGlobal.window = {
    api: {
      lab: {
        getContainerDetails: async () => ({
          success: false,
          error: '未找到容器详情',
          reason: 'not_found'
        })
      },
      logger: {
        debug: async () => ({ success: true }),
        info: async () => ({ success: true }),
        warn: async () => ({ success: true }),
        error: async () => ({ success: true })
      }
    }
  } as unknown as Window

  t.after(() => {
    if (originalWindow) {
      testGlobal.window = originalWindow
    } else {
      delete testGlobal.window
    }
    useContainerStore.setState({ selectedContainer: null })
  })

  useContainerStore.setState({ selectedContainer })

  const loaded = await useContainerStore
    .getState()
    .loadContainerDetails(selectedContainer.id, { silent: true })

  assert.equal(loaded, false)
  assert.equal(useContainerStore.getState().selectedContainer, null)
})

test('loadSelectedCompose 加载已保存 Compose 并回填项目名与端口映射', async (t) => {
  const testGlobal = globalThis as unknown as { window?: Window }
  const originalWindow = testGlobal.window
  const composeContent = `version: '3.8'

services:
  app:
    image: node:20
    ports:
      - "8080:3000"
`

  useLabCreatorStore.getState().reset()
  useLabCreatorStore.getState().setCreateType('compose')

  testGlobal.window = {
    api: {
      lab: {
        compose: {
          load: async (id: string) => ({
            success: true,
            config: {
              id,
              name: 'saved-compose',
              filename: 'saved-compose.yaml',
              createdAt: '2026-05-21T00:00:00.000Z',
              updatedAt: '2026-05-21T00:00:00.000Z',
              content: composeContent
            }
          })
        }
      },
      logger: {
        debug: async () => ({ success: true }),
        info: async () => ({ success: true }),
        warn: async () => ({ success: true }),
        error: async () => ({ success: true })
      }
    }
  } as unknown as Window

  t.after(() => {
    if (originalWindow) {
      testGlobal.window = originalWindow
    } else {
      delete testGlobal.window
    }
    useLabCreatorStore.getState().reset()
  })

  useLabCreatorStore.getState().setSelectedComposeId('compose-1')
  await useLabCreatorStore.getState().loadSelectedCompose()

  assert.equal(useComposeConfigStore.getState().composeContent, composeContent)
  assert.equal(useComposeConfigStore.getState().composeProjectName, 'saved-compose')
  assert.equal(useComposeConfigStore.getState().selectedComposeId, 'compose-1')
  assert.deepEqual(usePortMappingStore.getState().portMappings, [
    {
      hostPort: 8080,
      containerPort: 3000,
      protocol: 'tcp',
      editable: true
    }
  ])
})

test('loadSelectedDockerfile 加载已保存 Dockerfile 并解析端口', async (t) => {
  const testGlobal = globalThis as unknown as { window?: Window }
  const originalWindow = testGlobal.window
  const dockerfileContent = `FROM nginx:alpine

EXPOSE 5173/tcp 9229/udp
`

  useLabCreatorStore.getState().reset()
  useLabCreatorStore.getState().setCreateType('dockerfile')
  useLabCreatorStore.getState().setDockerfileProjectName('keep-name')

  testGlobal.window = {
    api: {
      lab: {
        dockerfile: {
          load: async (id: string) => ({
            success: true,
            config: {
              id,
              name: 'saved-dockerfile',
              filename: 'Dockerfile.saved',
              createdAt: '2026-05-21T00:00:00.000Z',
              updatedAt: '2026-05-21T00:00:00.000Z',
              content: dockerfileContent
            }
          })
        }
      },
      logger: {
        debug: async () => ({ success: true }),
        info: async () => ({ success: true }),
        warn: async () => ({ success: true }),
        error: async () => ({ success: true })
      }
    }
  } as unknown as Window

  t.after(() => {
    if (originalWindow) {
      testGlobal.window = originalWindow
    } else {
      delete testGlobal.window
    }
    useLabCreatorStore.getState().reset()
  })

  useLabCreatorStore.getState().setSelectedDockerfileId('dockerfile-1')
  await useLabCreatorStore.getState().loadSelectedDockerfile()

  assert.equal(useDockerfileConfigStore.getState().dockerfileContent, dockerfileContent)
  assert.equal(useDockerfileConfigStore.getState().dockerfileProjectName, 'keep-name')
  assert.equal(useDockerfileConfigStore.getState().selectedDockerfileId, 'dockerfile-1')
  assert.deepEqual(usePortMappingStore.getState().portMappings, [
    {
      hostPort: 5173,
      containerPort: 5173,
      protocol: 'tcp',
      editable: true
    },
    {
      hostPort: 9229,
      containerPort: 9229,
      protocol: 'udp',
      editable: true
    }
  ])
})
