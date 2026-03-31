import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { aliyunConfig, aliyunMiaobiService } from '@main/services/presentation/aliyun'

interface GenerateOutlineRequest {
  prompt: string
  sessionId: string
}

interface InitiateCreationRequest {
  taskId: string
  outline: string
}

interface BindArtifactRequest {
  taskId: string
  artifactId: number
}

function validateGenerateOutlineRequest(payload: unknown): {
  success: boolean
  data?: GenerateOutlineRequest
  error?: string
} {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: '请求参数格式不正确' }
  }

  const { prompt, sessionId } = payload as Partial<GenerateOutlineRequest>
  if (!prompt?.trim()) {
    return { success: false, error: 'prompt 不能为空' }
  }

  if (!sessionId?.trim()) {
    return { success: false, error: 'sessionId 不能为空' }
  }

  return {
    success: true,
    data: {
      prompt: prompt.trim(),
      sessionId: sessionId.trim()
    }
  }
}

function validateInitiateCreationRequest(payload: unknown): {
  success: boolean
  data?: InitiateCreationRequest
  error?: string
} {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: '请求参数格式不正确' }
  }

  const { taskId, outline } = payload as Partial<InitiateCreationRequest>
  if (!taskId?.trim()) {
    return { success: false, error: 'taskId 不能为空' }
  }

  if (!outline?.trim()) {
    return { success: false, error: 'outline 不能为空' }
  }

  return {
    success: true,
    data: {
      taskId: taskId.trim(),
      outline: outline.trim()
    }
  }
}

function validateBindArtifactRequest(payload: unknown): {
  success: boolean
  data?: BindArtifactRequest
  error?: string
} {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: '请求参数格式不正确' }
  }

  const { taskId, artifactId } = payload as Partial<BindArtifactRequest>
  if (!taskId?.trim()) {
    return { success: false, error: 'taskId 不能为空' }
  }

  const normalizedArtifactId = typeof artifactId === 'number' ? artifactId : Number.NaN
  if (!Number.isFinite(normalizedArtifactId) || normalizedArtifactId <= 0) {
    return { success: false, error: 'artifactId 非法' }
  }

  return {
    success: true,
    data: {
      taskId: taskId.trim(),
      artifactId: normalizedArtifactId
    }
  }
}

/**
 * 注册 PPT 导出相关的 IPC 处理程序
 * 处理 PPT 预览、生成等操作
 */
export function registerPptExportHandlers(): void {
  ipcMain.handle('ppt:getConfig', async () => {
    try {
      const result = aliyunConfig.getConfig()
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取阿里云妙笔配置失败', 'main', { error: errorMessage })
      return {
        success: false,
        configured: false,
        config: {
          accessKeyId: '',
          accessKeySecret: '',
          workspaceId: ''
        },
        error: errorMessage
      }
    }
  })

  ipcMain.handle('ppt:saveConfig', async (_event, config: unknown) => {
    if (!config || typeof config !== 'object') {
      return {
        success: false,
        error: '配置格式不正确'
      }
    }

    const { accessKeyId, accessKeySecret, workspaceId } = config as Record<string, unknown>

    const saveResult = aliyunConfig.saveConfig({
      accessKeyId: typeof accessKeyId === 'string' ? accessKeyId : '',
      accessKeySecret: typeof accessKeySecret === 'string' ? accessKeySecret : '',
      workspaceId: typeof workspaceId === 'string' ? workspaceId : ''
    })

    return saveResult
  })

  ipcMain.handle('ppt:testConfig', async (_event, config: unknown) => {
    logger.info('收到妙笔配置测试请求', 'main', { rawConfig: config })

    if (!config || typeof config !== 'object') {
      logger.warn('妙笔配置测试：参数格式不正确', 'main', { config })
      return {
        success: false,
        error: '配置格式不正确'
      }
    }

    const { accessKeyId, accessKeySecret, workspaceId } = config as Record<string, unknown>
    const normalizedConfig = {
      accessKeyId: typeof accessKeyId === 'string' ? accessKeyId : '',
      accessKeySecret: typeof accessKeySecret === 'string' ? accessKeySecret : '',
      workspaceId: typeof workspaceId === 'string' ? workspaceId : ''
    }

    logger.info('妙笔配置测试：开始测试', 'main', {
      accessKeyIdLength: normalizedConfig.accessKeyId.length,
      accessKeySecretLength: normalizedConfig.accessKeySecret.length,
      workspaceIdLength: normalizedConfig.workspaceId.length
    })

    try {
      const result = await aliyunMiaobiService.testConnection(normalizedConfig)
      logger.info('妙笔配置测试：测试完成', 'main', {
        success: result.success,
        error: result.error
      })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('妙笔配置测试：IPC handler 异常', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('ppt:generateOutline', async (event, payload: unknown) => {
    const validation = validateGenerateOutlineRequest(payload)
    if (!validation.success || !validation.data) {
      return {
        success: false,
        error: validation.error || '请求参数校验失败'
      }
    }

    const { prompt, sessionId } = validation.data

    try {
      const result = await aliyunMiaobiService.generateOutline(
        prompt,
        (text) => {
          event.sender.send('ppt:outline:chunk', { sessionId, text })
        },
        sessionId
      )

      if (result.success && result.taskId && result.outline) {
        event.sender.send('ppt:outline:done', {
          sessionId,
          taskId: result.taskId,
          outline: result.outline
        })
      } else {
        event.sender.send('ppt:outline:error', {
          sessionId,
          error: result.error || '大纲生成失败'
        })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('处理妙笔大纲生成请求失败', 'main', {
        sessionId,
        error: errorMessage
      })
      event.sender.send('ppt:outline:error', {
        sessionId,
        error: errorMessage
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  ipcMain.handle('ppt:initiateCreation', async (_event, payload: unknown) => {
    const validation = validateInitiateCreationRequest(payload)
    if (!validation.success || !validation.data) {
      return {
        success: false,
        error: validation.error || '请求参数校验失败'
      }
    }

    const { taskId, outline } = validation.data
    return aliyunMiaobiService.initiateCreation(taskId, outline)
  })

  ipcMain.handle('ppt:bindArtifact', async (_event, payload: unknown) => {
    const validation = validateBindArtifactRequest(payload)
    if (!validation.success || !validation.data) {
      return {
        success: false,
        error: validation.error || '请求参数校验失败'
      }
    }

    const { taskId, artifactId } = validation.data
    return aliyunMiaobiService.bindArtifact(taskId, artifactId)
  })
}
