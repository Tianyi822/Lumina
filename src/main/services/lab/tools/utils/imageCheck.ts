/**
 * Docker 镜像检查工具
 * 用于检查本地镜像是否存在
 */

import { getDockerService } from '../../docker/DockerService'
import { LabCreationType } from '@shared/types/lab'
import { parseDockerfileImages, parseComposeImages } from './dockerParser'

const dockerService = getDockerService()

/**
 * 检查实验室创建所需的镜像是否已存在于本地
 * @param creationType 创建类型
 * @param dockerfileContent Dockerfile 内容
 * @param composeContent docker-compose.yaml 内容
 * @returns 存在的镜像列表和所有需要的镜像列表
 */
export async function checkLocalImages(
  creationType: LabCreationType,
  dockerfileContent?: string,
  composeContent?: string
): Promise<{ existingImages: string[]; requiredImages: string[] }> {
  let requiredImages: string[] = []

  if (creationType === 'dockerfile' && dockerfileContent) {
    requiredImages = parseDockerfileImages(dockerfileContent)
  } else if (creationType === 'compose' && composeContent) {
    requiredImages = parseComposeImages(composeContent)
  }

  if (requiredImages.length === 0) {
    return { existingImages: [], requiredImages: [] }
  }

  const existingImages = await dockerService.checkImagesExist(requiredImages)
  return { existingImages, requiredImages }
}
