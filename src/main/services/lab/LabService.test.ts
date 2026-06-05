import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { LabService } from './LabService'
import { getLabDirPath } from './labPaths'
import type { LabData, LabBackendType, LabCreationType } from '@shared/types/lab'

function createSshLab(overrides: Partial<LabData> = {}): LabData {
  return {
    labId: 'lab-1778054811882-c8v2zfkd',
    name: 'SSH 实验室',
    status: 'stopped',
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    creationType: 'ssh',
    containerIds: [],
    backendType: 'ssh',
    ssh: {
      host: '192.168.1.100',
      port: 22,
      username: 'root',
      authType: 'password',
      connected: false
    },
    ...overrides
  }
}

function resetLabDir(): void {
  const labDir = getLabDirPath()
  if (existsSync(labDir)) {
    rmSync(labDir, { recursive: true, force: true })
  }
}

test('LabService 创建 SSH 实验室保存后可重新加载', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const lab = createSshLab()

  const saveResult = await service.saveLab(lab, { silent: true })
  assert.equal(saveResult.success, true)

  const loaded = await service.loadLab(lab.labId, { silent: true })
  assert.ok(loaded !== null)
  assert.equal(loaded!.labId, lab.labId)
  assert.equal(loaded!.name, lab.name)
  assert.equal(loaded!.backendType, 'ssh')
  assert.equal(loaded!.creationType, 'ssh')
})

test('LabService.loadLab 修正旧数据中的非 ssh 类型为 ssh', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const lab = createSshLab({ backendType: 'docker' as LabBackendType, creationType: 'existing' as LabCreationType })
  await service.saveLab(lab, { silent: true })

  const loaded = await service.loadLab(lab.labId, { silent: true })
  assert.equal(loaded?.backendType, 'ssh')
  assert.equal(loaded?.creationType, 'ssh')
})

test('LabService.createLab 参数校验：空名称 → 错误', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const r = await service.createLab({
    name: '',
    creationType: 'ssh',
    sshHost: '1.2.3.4',
    sshUsername: 'root'
  })
  assert.equal(r.success, false)
  assert.ok(r.error!.includes('名称'))
})

test('LabService.createLab 参数校验：缺 sshHost → 错误', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const r = await service.createLab({
    name: 'test',
    creationType: 'ssh',
    sshHost: '',
    sshUsername: 'root'
  })
  assert.equal(r.success, false)
  assert.ok(r.error!.includes('sshHost'))
})

test('LabService.createLab 参数校验：缺 sshUsername → 错误', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const r = await service.createLab({
    name: 'test',
    creationType: 'ssh',
    sshHost: '1.2.3.4',
    sshUsername: ''
  })
  assert.equal(r.success, false)
  assert.ok(r.error!.includes('sshUsername'))
})

test('LabService.createLab 成功创建 SSH 实验室', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const r = await service.createLab({
    name: 'My Server',
    creationType: 'ssh',
    sshHost: '10.0.0.1',
    sshPort: 2222,
    sshUsername: 'admin',
    sshAuthType: 'key',
    sshKeyName: 'my-key'
  })
  assert.equal(r.success, true)
  assert.equal(r.lab?.name, 'My Server')
  assert.equal(r.lab?.creationType, 'ssh')
  assert.equal(r.lab?.backendType, 'ssh')
  assert.equal(r.lab?.ssh?.host, '10.0.0.1')
  assert.equal(r.lab?.ssh?.port, 2222)
  assert.equal(r.lab?.ssh?.username, 'admin')
  assert.equal(r.lab?.ssh?.authType, 'key')
})

test('LabService.deleteLab 删除 SSH 实验室', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const created = await service.createLab({
    name: 'To Delete',
    creationType: 'ssh',
    sshHost: '10.0.0.1',
    sshUsername: 'root'
  })
  assert.equal(created.success, true)

  const result = await service.deleteLab(created.lab!.labId)
  assert.equal(result.success, true)

  const loaded = await service.loadLab(created.lab!.labId, { silent: true })
  assert.equal(loaded, null)
})

test('LabService.listLabs 返回列表按时间倒序', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const lab1: LabData = {
    ...createSshLab(),
    labId: 'lab-1000000000000-a1b2c3d4',
    name: 'Lab A',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
  const lab2: LabData = {
    ...createSshLab(),
    labId: 'lab-2000000000000-e5f6g7h8',
    name: 'Lab B',
    createdAt: '2026-06-01T00:00:00.000Z'
  }
  await service.saveLab(lab1, { silent: true })
  await service.saveLab(lab2, { silent: true })

  const list = await service.listLabs()
  const indexA = list.findIndex((l) => l.labId === lab1.labId)
  const indexB = list.findIndex((l) => l.labId === lab2.labId)
  assert.ok(indexA > indexB, '较旧的 Lab A 应在较新的 Lab B 之后')
})

test('LabService.renameLab 成功重命名', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const lab = createSshLab()
  await service.saveLab(lab, { silent: true })

  const result = await service.renameLab(lab.labId, '新名称')
  assert.equal(result.success, true)

  const loaded = await service.loadLab(lab.labId, { silent: true })
  assert.equal(loaded?.name, '新名称')
})

test('LabService 操作日志读写', async (t) => {
  resetLabDir()
  t.after(() => resetLabDir())

  const service = new LabService()
  const lab = createSshLab()
  await service.saveLab(lab, { silent: true })

  await service.logOperation(lab.labId, '测试消息', 'info')
  await service.logOperation(lab.labId, '错误消息', 'error')

  const logs = await service.readOperationLog(lab.labId)
  assert.equal(logs.length, 2)
  assert.equal(logs[0].level, 'info')
  assert.equal(logs[1].level, 'error')
})
