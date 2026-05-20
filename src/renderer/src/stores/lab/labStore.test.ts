import test from 'node:test'
import assert from 'node:assert/strict'
import { useLabStore } from './labStore'
import { useLabListStore } from './labListStore'
import type { LabData, LabListItem } from '@renderer/types/lab'

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
