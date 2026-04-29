import { getDockerService } from '../docker/DockerService'

const dockerService = getDockerService()

const FRONTEND_BASE_IMAGE_TAG = 'lumina-frontend-base'

/**
 * 确保前端基础镜像可用
 */
export async function ensureFrontendBaseImage(): Promise<string> {
  const buildResult = await dockerService.buildImageFromDockerfile({
    tag: FRONTEND_BASE_IMAGE_TAG,
    dockerfile: `FROM oven/bun:1
WORKDIR /runtime
RUN mkdir -p /workspace
EXPOSE 5173 3000 8080
CMD ["sleep", "infinity"]`
  })

  if (!buildResult.success) {
    throw new Error(buildResult.error || '构建前端基础镜像失败')
  }

  return buildResult.imageId || FRONTEND_BASE_IMAGE_TAG
}
