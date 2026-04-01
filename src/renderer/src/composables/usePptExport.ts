/**
 * PPT 导出 Composable
 * 封装 PPT 导出相关的状态管理和 API 调用逻辑
 */

import { ref, onUnmounted, type Ref } from 'vue'
import { useQuanmiaoSDK } from './useQuanmiaoSDK'
import type { CreatePPTOptions } from './useQuanmiaoSDK'

/**
 * 大纲生成状态
 */
export type OutlineStatus = 'idle' | 'generating' | 'done' | 'error'

/**
 * PPT 导出配置
 */
export interface PptExportConfig {
  accessKeyId: string
  accessKeySecret: string
  workspaceId: string
}

/**
 * usePptExport 返回类型
 */
export interface UsePptExportReturn {
  // 状态
  isConfigured: Ref<boolean>
  outlineStatus: Ref<OutlineStatus>
  outlineText: Ref<string>
  taskId: Ref<string>
  appkey: Ref<string>
  code: Ref<string>
  renderingStatus: Ref<import('./useQuanmiaoSDK').PptRenderingStatus>
  artifactId: Ref<number | null>
  error: Ref<string | null>

  // 方法
  checkConfig: () => Promise<void>
  generateOutline: (prompt: string) => Promise<void>
  initiateCreation: () => Promise<void>
  bindArtifact: () => Promise<void>
  createPPT: (container: HTMLElement, speaker?: string) => void
  editPPT: (container: HTMLElement, speaker?: string) => void
  destroyPPT: () => void
  reset: () => void
}

/**
 * PPT 导出 Composable
 * 提供阿里云妙笔 PPT 生成的状态管理和 API 调用封装
 *
 * @example
 * ```typescript
 * const {
 *   isConfigured,
 *   outlineStatus,
 *   outlineText,
 *   generateOutline,
 *   initiateCreation,
 *   createPPT,
 *   reset
 * } = usePptExport()
 *
 * // 检查配置
 * await checkConfig()
 *
 * // 生成大纲
 * await generateOutline('创建一个关于 AI 的演示文稿')
 *
 * // 发起创建
 * await initiateCreation()
 *
 * // 创建 PPT 实例
 * createPPT(document.getElementById('ppt-container')!, '张三')
 * ```
 */
export function usePptExport(): UsePptExportReturn {
  // ==================== 组合其他 composable ====================

  const {
    createPPT: sdkCreatePPT,
    editPPT: sdkEditPPT,
    destroy: sdkDestroy,
    renderingStatus: sdkRenderingStatus,
    artifactId: sdkArtifactId
  } = useQuanmiaoSDK()

  // ==================== 状态定义 ====================

  /** 是否已配置 */
  const isConfigured = ref(false)
  /** 大纲生成状态 */
  const outlineStatus = ref<OutlineStatus>('idle')
  /** 大纲文本 */
  const outlineText = ref('')
  /** 任务 ID */
  const taskId = ref('')
  /** 应用密钥 */
  const appkey = ref('')
  /** 授权码 */
  const code = ref('')
  /** 错误信息 */
  const error = ref<string | null>(null)

  // ==================== 内部状态 ====================

  /** 当前会话 ID */
  let currentSessionId: string | null = null

  // ==================== API 方法 ====================

  /**
   * 检查配置状态
   */
  const checkConfig = async (): Promise<void> => {
    try {
      const result = await window.api.pptExport.getConfig()
      if (result.success) {
        isConfigured.value = result.configured
      } else {
        error.value = result.error ?? '获取配置失败'
        isConfigured.value = false
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '检查配置时发生错误'
      error.value = errorMsg
      isConfigured.value = false
    }
  }

  /**
   * 生成大纲
   * 流式接收生成的大纲内容
   *
   * @param prompt - 生成提示词
   */
  const generateOutline = async (prompt: string): Promise<void> => {
    // 清理之前的监听器
    if (currentSessionId) {
      window.api.pptExport.removeOutlineListeners()
    }

    // 生成新的会话 ID
    currentSessionId = crypto.randomUUID()
    outlineStatus.value = 'generating'
    outlineText.value = ''
    taskId.value = ''
    error.value = null

    try {
      // 注册监听器
      const unregisterChunk = window.api.pptExport.onOutlineChunk((_event, data) => {
        if (data.sessionId === currentSessionId) {
          outlineText.value += data.text
        }
      })

      const unregisterDone = window.api.pptExport.onOutlineDone((_event, data) => {
        if (data.sessionId === currentSessionId) {
          taskId.value = data.taskId
          outlineText.value = data.outline
          outlineStatus.value = 'done'
          // 清理监听器
          unregisterChunk()
          unregisterDone()
          window.api.pptExport.removeOutlineListeners()
        }
      })

      const unregisterError = window.api.pptExport.onOutlineError((_event, data) => {
        if (data.sessionId === currentSessionId) {
          error.value = data.error
          outlineStatus.value = 'error'
          // 清理监听器
          unregisterChunk()
          unregisterDone()
          unregisterError()
          window.api.pptExport.removeOutlineListeners()
        }
      })

      // 调用生成大纲 API
      const result = await window.api.pptExport.generateOutline(prompt, currentSessionId)

      if (!result.success) {
        error.value = result.error ?? '生成大纲失败'
        outlineStatus.value = 'error'
        // 清理监听器
        unregisterChunk()
        unregisterDone()
        unregisterError()
        window.api.pptExport.removeOutlineListeners()
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成大纲时发生错误'
      error.value = errorMsg
      outlineStatus.value = 'error'
      window.api.pptExport.removeOutlineListeners()
    }
  }

  /**
   * 发起创建
   * 使用生成的大纲发起 PPT 创建请求
   */
  const initiateCreation = async (): Promise<void> => {
    if (!taskId.value || !outlineText.value) {
      error.value = '请先生成大纲'
      return
    }

    sdkRenderingStatus.value = 'making'
    error.value = null

    try {
      const result = await window.api.pptExport.initiateCreation(taskId.value, outlineText.value)

      if (result.success && result.appkey && result.code) {
        appkey.value = result.appkey
        code.value = result.code
      } else {
        error.value = result.error ?? '发起创建失败'
        sdkRenderingStatus.value = 'error'
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '发起创建时发生错误'
      error.value = errorMsg
      sdkRenderingStatus.value = 'error'
    }
  }

  /**
   * 绑定 Artifact
   * 将生成的 PPT 绑定到 Artifact
   */
  const bindArtifact = async (): Promise<void> => {
    if (!taskId.value || sdkArtifactId.value === null) {
      error.value = '无效的任务 ID 或 Artifact ID'
      return
    }

    error.value = null

    try {
      const result = await window.api.pptExport.bindArtifact(taskId.value, sdkArtifactId.value)

      if (!result.success) {
        error.value = result.error ?? '绑定 Artifact 失败'
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '绑定 Artifact 时发生错误'
      error.value = errorMsg
    }
  }

  // ==================== SDK 方法封装 ====================

  /**
   * 创建 PPT 实例
   * 调用妙笔 SDK 创建 PPT
   *
   * @param container - 容器元素
   * @param speaker - 讲师信息
   */
  const createPPT = (container: HTMLElement, speaker?: string): void => {
    if (!appkey.value || !code.value || !outlineText.value) {
      error.value = '请先完成大纲生成和创建流程'
      return
    }

    try {
      const options: CreatePPTOptions = {
        appkey: appkey.value,
        code: code.value,
        container,
        content: outlineText.value,
        speaker
      }
      sdkCreatePPT(options)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建 PPT 实例失败'
      error.value = errorMsg
    }
  }

  /**
   * 编辑 PPT 实例
   * 调用妙笔 SDK 编辑 PPT
   *
   * @param container - 容器元素
   * @param speaker - 讲师信息
   */
  const editPPT = (container: HTMLElement, speaker?: string): void => {
    if (!appkey.value || !code.value) {
      error.value = '请先完成创建流程'
      return
    }

    try {
      sdkEditPPT({
        appkey: appkey.value,
        code: code.value,
        container,
        speaker
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '编辑 PPT 实例失败'
      error.value = errorMsg
    }
  }

  /**
   * 销毁 PPT 实例
   */
  const destroyPPT = (): void => {
    try {
      sdkDestroy()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '销毁 PPT 实例失败'
      error.value = errorMsg
    }
  }

  // ==================== 状态重置方法 ====================

  /**
   * 重置所有状态
   */
  const reset = (): void => {
    isConfigured.value = false
    outlineStatus.value = 'idle'
    outlineText.value = ''
    taskId.value = ''
    appkey.value = ''
    code.value = ''
    error.value = null
    currentSessionId = null
    // 不重置 SDK 状态，由外部调用 destroy 控制
  }

  // ==================== 生命周期 ====================

  // 组件卸载时清理监听器
  onUnmounted(() => {
    window.api.pptExport.removeOutlineListeners()
  })

  // ==================== 返回 ====================

  return {
    // 状态
    isConfigured,
    outlineStatus,
    outlineText,
    taskId,
    appkey,
    code,
    renderingStatus: sdkRenderingStatus,
    artifactId: sdkArtifactId,
    error,
    // 方法
    checkConfig,
    generateOutline,
    initiateCreation,
    bindArtifact,
    createPPT,
    editPPT,
    destroyPPT,
    reset
  }
}

export default usePptExport
