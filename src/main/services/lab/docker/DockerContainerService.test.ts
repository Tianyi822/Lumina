import test from 'node:test'
import assert from 'node:assert/strict'
import { DockerContainerMapper } from './DockerContainerMapper'
import { DockerContainerService } from './DockerContainerService'
import { DockerOperationError } from './dockerErrors'

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

function createService(docker: unknown): DockerContainerService {
  const context = {
    getDocker: () => docker
  }
  const mapper = new DockerContainerMapper(context as never)
  return new DockerContainerService(context as never, mapper)
}

test('DockerContainerService 将 inspect 404 识别为容器不存在', async () => {
  const service = createService({
    getContainer: () => ({
      inspect: async () => {
        throw createDockerError('No such container', 404)
      }
    })
  })

  const details = await service.getContainerDetails('missing-container')

  assert.equal(details, null)
})

test('DockerContainerService 遇到 inspect 500 时抛出临时 Docker 错误', async () => {
  const service = createService({
    getContainer: () => ({
      inspect: async () => {
        throw createDockerError('server error', 500)
      }
    })
  })

  await assert.rejects(
    () => service.getContainerDetails('unstable-container'),
    (error: unknown) => {
      assert.ok(error instanceof DockerOperationError)
      assert.equal(error.reason, 'docker_server_error')
      return true
    }
  )
})

test('DockerContainerService 遇到 listContainers 500 时不返回空列表', async () => {
  const service = createService({
    listContainers: async () => {
      throw createDockerError('server error', 500)
    }
  })

  await assert.rejects(
    () => service.listContainers({ state: 'all' }),
    (error: unknown) => {
      assert.ok(error instanceof DockerOperationError)
      assert.equal(error.reason, 'docker_server_error')
      return true
    }
  )
})
