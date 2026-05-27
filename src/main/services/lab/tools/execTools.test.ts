import test from 'node:test'
import assert from 'node:assert/strict'
import { execCommandTool } from './execTools'
import { labService } from '../LabService'
import { sshService } from '../ssh'
import type { LabData, ExecResult } from '@shared/types/lab'

function createMockSshLab(): LabData {
  return {
    labId: 'ssh-lab-1',
    name: 'SSH Test Lab',
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    creationType: 'existing',
    containerIds: [],
    backendType: 'ssh',
    ssh: { host: '1.2.3.4', port: 22, username: 'root', authType: 'password' }
  }
}

test('execCommandTool SSH 分发', async (t) => {
  const originalLoadLab = labService.loadLab.bind(labService)
  const originalIsConnected = sshService.isConnected.bind(sshService)
  const originalExecCommand = sshService.execCommand.bind(sshService)

  await t.test('SSH 后端未连接 → 返回错误', async () => {
    labService.loadLab = async () => createMockSshLab()
    sshService.isConnected = () => false

    try {
      const result = await execCommandTool.execute({
        lab_id: 'ssh-lab-1',
        command: 'echo hello'
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('SSH 未连接'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
    }
  })

  await t.test('SSH 后端已连接 → execCommand 成功', async () => {
    labService.loadLab = async () => createMockSshLab()
    sshService.isConnected = () => true
    sshService.execCommand = async (): Promise<ExecResult> => ({
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
      duration: 10
    })

    try {
      const result = await execCommandTool.execute({
        lab_id: 'ssh-lab-1',
        command: 'echo hello'
      })
      assert.equal(result.success, true)
      assert.ok(result.content)
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
      sshService.execCommand = originalExecCommand
    }
  })

  await t.test('SSH execCommand 返回 null → 返回错误', async () => {
    labService.loadLab = async () => createMockSshLab()
    sshService.isConnected = () => true
    sshService.execCommand = async () => null

    try {
      const result = await execCommandTool.execute({
        lab_id: 'ssh-lab-1',
        command: 'echo hello'
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('SSH 命令执行失败'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
      sshService.execCommand = originalExecCommand
    }
  })

  await t.test('SSH execCommand 返回 systemError → 返回错误', async () => {
    labService.loadLab = async () => createMockSshLab()
    sshService.isConnected = () => true
    sshService.execCommand = async (): Promise<ExecResult> => ({
      exitCode: -1,
      stdout: '',
      stderr: 'connection lost',
      duration: 50,
      systemError: true
    })

    try {
      const result = await execCommandTool.execute({
        lab_id: 'ssh-lab-1',
        command: 'ls'
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('connection lost'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
      sshService.execCommand = originalExecCommand
    }
  })

  await t.test('缺少 command 参数 → 返回错误', async () => {
    labService.loadLab = async () => createMockSshLab()
    sshService.isConnected = () => true

    try {
      const result = await execCommandTool.execute({
        lab_id: 'ssh-lab-1'
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('缺少必需参数'))
    } finally {
      labService.loadLab = originalLoadLab
      sshService.isConnected = originalIsConnected
    }
  })

  await t.test('找不到实验室 → 返回错误', async () => {
    labService.loadLab = async () => null

    try {
      const result = await execCommandTool.execute({
        lab_id: 'nonexistent',
        command: 'ls'
      })
      assert.equal(result.success, false)
      assert.ok(result.error!.includes('未找到指定的实验室'))
    } finally {
      labService.loadLab = originalLoadLab
    }
  })
})
