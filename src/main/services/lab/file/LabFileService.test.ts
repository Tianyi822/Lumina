import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'stream'
import type { ContainerDetails, LabData } from '@shared/types/lab'
import { LabFileService } from './LabFileService'
import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []

  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

function mockLabAndDocker(mockOptions?: { putArchiveError?: Error }): {
  capturedArchive: () => unknown
  capturedArchiveBytes: () => Buffer | null
  capturedPath: () => string | undefined
  restore: () => void
} {
  let archiveArg: unknown
  let archiveBytes: Buffer | null = null
  let pathArg: string | undefined

  const dockerService = getDockerService()
  const originalLoadLab = labService.loadLab
  const originalGetContainerDetails = dockerService.getContainerDetails
  const originalGetDocker = dockerService.getDocker
  const originalBuildTarFromMemory = LabFileService.buildTarFromMemory

  const labData: LabData = {
    labId: 'lab-stream-test',
    name: '流式写入测试实验室',
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    creationType: 'existing',
    primaryContainerId: 'container-stream-test',
    containerIds: ['container-stream-test']
  }

  const containerDetails: ContainerDetails = {
    id: 'container-stream-test',
    shortId: 'container',
    names: ['container-stream-test'],
    image: 'node:20',
    state: 'running',
    status: 'running',
    ports: [],
    created: 0,
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
    workingDir: '/workspace',
    entrypoint: []
  }

  labService.loadLab = (() => labData) as typeof labService.loadLab

  dockerService.getContainerDetails = (async () => {
    return containerDetails
  }) as typeof dockerService.getContainerDetails

  dockerService.getDocker = (() => ({
    getContainer: (containerId: string) => {
      assert.equal(containerId, 'container-stream-test')
      return {
        putArchive: async (
          archive: Buffer | NodeJS.ReadableStream,
          options: { path?: string }
        ) => {
          archiveArg = archive
          pathArg = options.path
          if (mockOptions?.putArchiveError) {
            throw mockOptions.putArchiveError
          }
          if (Buffer.isBuffer(archive)) {
            archiveBytes = archive
          } else {
            archiveBytes = await readStream(archive)
          }
        }
      }
    }
  })) as unknown as typeof dockerService.getDocker

  LabFileService.buildTarFromMemory = true

  return {
    capturedArchive: () => archiveArg,
    capturedArchiveBytes: () => archiveBytes,
    capturedPath: () => pathArg,
    restore: () => {
      labService.loadLab = originalLoadLab
      dockerService.getContainerDetails = originalGetContainerDetails
      dockerService.getDocker = originalGetDocker
      LabFileService.buildTarFromMemory = originalBuildTarFromMemory
    }
  }
}

test('writeProjectFiles 默认通过 tar stream 上传到容器', async () => {
  const mock = mockLabAndDocker()
  const service = new LabFileService()

  try {
    const result = await service.writeProjectFiles(
      'lab-stream-test',
      [
        { path: 'src/App.vue', content: '<template>hello</template>' },
        { path: 'src/main.ts', content: 'console.log("hello")' }
      ],
      '/workspace'
    )

    assert.equal(result.success, true)
    assert.equal(result.writtenCount, 2)
    assert.equal(mock.capturedPath(), '/workspace')
    assert.equal(Buffer.isBuffer(mock.capturedArchive()), false)
    assert.ok(mock.capturedArchive() instanceof Readable)
    assert.match(mock.capturedArchiveBytes()?.toString('utf-8') ?? '', /template>hello/)
  } finally {
    mock.restore()
  }
})

test('writeProjectFiles 上传失败时保留错误结构', async () => {
  const mock = mockLabAndDocker({ putArchiveError: new Error('docker daemon busy') })
  const service = new LabFileService()

  try {
    const result = await service.writeProjectFiles(
      'lab-stream-test',
      [{ path: 'src/App.vue', content: '<template>hello</template>' }],
      '/workspace'
    )

    assert.equal(result.success, false)
    assert.equal(result.writtenCount, 0)
    assert.deepEqual(result.failedFiles, ['src/App.vue'])
    assert.match(result.error ?? '', /docker daemon busy/)
  } finally {
    mock.restore()
  }
})
