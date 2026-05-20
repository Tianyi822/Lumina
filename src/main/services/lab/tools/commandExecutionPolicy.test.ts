import test from 'node:test'
import assert from 'node:assert/strict'
import type { LabData } from '@shared/types/lab'
import { getCommandExecutionPolicy } from './commandExecutionPolicy'
import {
  formatExecCommandToolResult,
  resolveProjectRootForWrite,
  selectReusableFrontendLab
} from './toolHelpers'

test('实验室沙箱命令策略允许容器内命令直接执行', () => {
  const commands = ['find /app -type f 2>/dev/null | head -10', 'rm -rf /tmp/lumina-sandbox-cache']

  for (const command of commands) {
    const decision = getCommandExecutionPolicy('lab_sandbox', command)
    assert.equal(decision.canExecute, true)
    assert.equal(decision.requiresUserInteraction, false)
  }
})

test('宿主机命令策略要求用户交互确认', () => {
  const decision = getCommandExecutionPolicy('host', 'rm -rf /tmp/lumina-host-cache')

  assert.equal(decision.canExecute, false)
  assert.equal(decision.requiresUserInteraction, true)
  assert.match(decision.reason || '', /宿主机命令/)
  assert.deepEqual(
    decision.options?.map((option) => option.value),
    ['allow_host', 'cancel', 'use_lab_sandbox']
  )
})

test('lab__exec_command 非零退出码保留结构化输出且不视为工具失败', () => {
  const result = formatExecCommandToolResult('ls -la /app', undefined, {
    exitCode: 2,
    stdout: '',
    stderr: "ls: cannot access '/app': No such file or directory",
    duration: 12
  })

  assert.equal(result.success, true)
  const content = result.content as Array<{ type: string; text: string }>
  const payload = JSON.parse(content[0].text) as {
    command: string
    exit_code: number
    stdout: string
    stderr: string
  }

  assert.equal(payload.command, 'ls -la /app')
  assert.equal(payload.exit_code, 2)
  assert.equal(payload.stdout, '')
  assert.match(payload.stderr, /No such file or directory/)
})

test('前端实验室写文件默认复用自身项目根目录', () => {
  const projectRoot = resolveProjectRootForWrite({
    backendType: 'docker',
    frontend: {
      framework: 'react',
      storageType: 'docker-volume',
      volumeName: 'lab-volume',
      mountPath: '/workspace',
      projectRoot: '/workspace',
      packageManager: 'bun',
      runtime: 'bun',
      builder: 'bun',
      bootstrapStatus: 'runtime-ready',
      workspaceInitialized: true,
      dependenciesInstalled: true,
      buildValidated: false,
      containerPort: 5173,
      hostPort: 35173,
      previewUrl: 'http://127.0.0.1:35173'
    }
  })

  assert.equal(projectRoot, '/workspace')
  assert.equal(
    resolveProjectRootForWrite({ frontend: undefined, backendType: 'docker' }, '/app'),
    '/app'
  )
})

test('同名同框架前端实验室默认选择最新可复用实例', () => {
  const baseLab = {
    name: 'Tianyi-Blog',
    status: 'running',
    createdAt: '2026-05-04T16:05:07.906Z',
    updatedAt: '2026-05-04T16:05:27.316Z',
    creationType: 'dockerfile',
    containerIds: ['container-1'],
    isOrphan: false,
    primaryContainerId: 'container-1',
    backendType: 'docker'
  } satisfies Omit<LabData, 'labId' | 'frontend'>

  const labs = [
    {
      ...baseLab,
      labId: 'lab-new',
      frontend: {
        framework: 'react',
        storageType: 'docker-volume',
        volumeName: 'volume-new',
        mountPath: '/workspace',
        projectRoot: '/workspace',
        packageManager: 'bun',
        runtime: 'bun',
        builder: 'bun',
        bootstrapStatus: 'runtime-ready',
        workspaceInitialized: true,
        dependenciesInstalled: true,
        buildValidated: false,
        containerPort: 5173,
        hostPort: 35174,
        previewUrl: 'http://127.0.0.1:35174'
      }
    },
    {
      ...baseLab,
      labId: 'lab-vanilla',
      frontend: {
        framework: 'vanilla',
        storageType: 'docker-volume',
        volumeName: 'volume-vanilla',
        mountPath: '/workspace',
        projectRoot: '/workspace',
        packageManager: 'bun',
        runtime: 'bun',
        builder: 'bun',
        bootstrapStatus: 'runtime-ready',
        workspaceInitialized: true,
        dependenciesInstalled: true,
        buildValidated: false,
        containerPort: 5173,
        hostPort: 35175,
        previewUrl: 'http://127.0.0.1:35175'
      }
    }
  ] satisfies LabData[]

  const match = selectReusableFrontendLab(labs, 'Tianyi-Blog', 'react')

  assert.equal(match?.labId, 'lab-new')
  assert.equal(selectReusableFrontendLab(labs, 'Other-Blog', 'vanilla'), null)
})
