import test from 'node:test'
import assert from 'node:assert/strict'
import { writeProjectFilesTool } from './fileTools'
import { labService } from '../LabService'
import { sshService } from '../ssh'
import type { LabData, FileWriteResult } from '@shared/types/lab'

function createMockSshLab(): LabData {
  return {
    labId: 'ssh-lab-2',
    name: 'SSH File Test Lab',
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    creationType: 'existing',
    containerIds: [],
    backendType: 'ssh',
    ssh: { host: '1.2.3.4', port: 22, username: 'root', authType: 'password' }
  }
}

test('writeProjectFilesTool SSH 分发', async (t) => {
  const originalLoadLab = labService.loadLab.bind(labService)
  const originalIsConnected = sshService.isConnected.bind(sshService)
  const originalWriteFiles = sshService.writeFiles.bind(sshService)

  await t.test('SSH 后端未连接 → 返回错误', async () => {
    labService.loadLab = () => createMockSshLab()
    sshService.isConnected = () => false

    try {
      const result = await writeProjectFilesTool.execute({
        lab_id: 'ssh-lab-2',
        files: [{ path: 'test.txt', content: 'hello' }]
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('SSH 未连接'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
    }
  })

  await t.test('SSH 后端已连接 → writeFiles 成功', async () => {
    labService.loadLab = () => createMockSshLab()
    sshService.isConnected = () => true
    sshService.writeFiles = async (): Promise<FileWriteResult> => ({
      success: true,
      writtenCount: 3
    })

    try {
      const result = await writeProjectFilesTool.execute({
        lab_id: 'ssh-lab-2',
        files: [
          { path: 'a.txt', content: 'a' },
          { path: 'b.txt', content: 'b' },
          { path: 'c.txt', content: 'c' }
        ]
      })
      assert.equal(result.success, true)
      assert.ok(result.content)
      const text = (result.content as { type: string; text: string }[])[0].text
      assert.ok(text.includes('成功写入 3 个文件'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
      sshService.writeFiles = originalWriteFiles
    }
  })

  await t.test('SSH writeFiles 失败 → 返回错误', async () => {
    labService.loadLab = () => createMockSshLab()
    sshService.isConnected = () => true
    sshService.writeFiles = async (): Promise<FileWriteResult> => ({
      success: false,
      writtenCount: 0,
      error: 'disk full'
    })

    try {
      const result = await writeProjectFilesTool.execute({
        lab_id: 'ssh-lab-2',
        files: [{ path: 'big.txt', content: 'large content' }]
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('disk full'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
      sshService.writeFiles = originalWriteFiles
    }
  })

  await t.test('缺少 files 参数 → 返回错误', async () => {
    labService.loadLab = () => createMockSshLab()
    sshService.isConnected = () => true

    try {
      const result = await writeProjectFilesTool.execute({
        lab_id: 'ssh-lab-2',
        files: []
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('缺少必需参数'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
    }
  })

  await t.test('找不到实验室 → 返回错误', async () => {
    labService.loadLab = () => null

    try {
      const result = await writeProjectFilesTool.execute({
        lab_id: 'nonexistent',
        files: [{ path: 'test.txt', content: 'hello' }]
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('未找到指定的实验室'))
    } finally {
      labService.loadLab = originalLoadLab
    }
  })

  await t.test('SSH writeFiles 无错误消息时返回兜底信息', async () => {
    labService.loadLab = () => createMockSshLab()
    sshService.isConnected = () => true
    sshService.writeFiles = async (): Promise<FileWriteResult> => ({
      success: false,
      writtenCount: 0
    })

    try {
      const result = await writeProjectFilesTool.execute({
        lab_id: 'ssh-lab-2',
        files: [{ path: 'test.txt', content: 'x' }]
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('文件写入失败'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
      sshService.writeFiles = originalWriteFiles
    }
  })
})
