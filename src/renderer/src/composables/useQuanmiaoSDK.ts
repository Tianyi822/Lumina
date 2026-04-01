/**
 * 妙笔 SDK Composable
 * 封装阿里云妙笔前端 SDK 的加载和调用逻辑
 */

import { ref, type Ref } from 'vue'

/**
 * 妙笔 SDK 方法选项
 */
export interface CreatePPTOptions {
  /** 应用密钥 */
  appkey: string
  /** 授权码 */
  code: string
  /** 容器元素 */
  container: HTMLElement
  /** PPT 内容（JSON 字符串） */
  content: string
  /** 讲师信息 */
  speaker?: string
  /** 消息回调 */
  onMessage?: (message: QuanmiaoMessage) => void
}

/**
 * 妙笔 SDK 消息类型
 */
export type QuanmiaoMessageType = 'CHARGING' | 'SET_PPT_MAKING_STATUS' | 'ERROR'

/**
 * 妙笔 SDK 消息结构
 */
export interface QuanmiaoMessage {
  type: QuanmiaoMessageType
  data?: unknown
}

/**
 * 编辑 PPT 方法选项
 */
export interface EditPPTOptions {
  /** 应用密钥 */
  appkey: string
  /** 授权码 */
  code: string
  /** 容器元素 */
  container: HTMLElement
  /** 讲师信息 */
  speaker?: string
  /** 消息回调 */
  onMessage?: (message: unknown) => void
}

/**
 * 妙笔 SDK 全局接口
 */
export interface QuanmiaoSDK {
  createPPT: (options: CreatePPTOptions) => void
  editPPT: (options: EditPPTOptions) => void
  deleteIframe: () => void
}

/**
 * Window 全局对象类型扩展
 */
declare global {
  interface Window {
    Quanmiao?: QuanmiaoSDK
  }
}

/**
 * PPT 渲染状态
 */
export type PptRenderingStatus = 'idle' | 'making' | 'done' | 'error'

/**
 * useQuanmiaoSDK 返回类型
 */
export interface UseQuanmiaoSDKReturn {
  // 状态
  sdkLoaded: Ref<boolean>
  loading: Ref<boolean>
  error: Ref<string | null>
  renderingStatus: Ref<PptRenderingStatus>
  artifactId: Ref<number | null>

  // 方法
  loadSDK: () => Promise<void>
  createPPT: (options: CreatePPTOptions) => void
  editPPT: (options: EditPPTOptions) => void
  destroy: () => void
}

/**
 * 妙笔 SDK Composable
 * 提供阿里云妙笔前端 SDK 的加载和管理功能
 *
 * @example
 * ```typescript
 * const { sdkLoaded, loadSDK, createPPT, destroy } = useQuanmiaoSDK()
 *
 * // 加载 SDK
 * await loadSDK()
 *
 * // 创建 PPT
 * if (sdkLoaded.value) {
 *   createPPT({
 *     appkey: 'xxx',
 *     code: 'xxx',
 *     container: document.getElementById('ppt-container')!,
 *     content: JSON.stringify({ slides: [...] })
 *   })
 * }
 *
 * // 销毁实例
 * destroy()
 * ```
 */
const SDK_URL = 'https://quanmiao-public.oss-cn-beijing.aliyuncs.com/quanmiao-sdk/v1.0.0/index.js'

export function useQuanmiaoSDK(): UseQuanmiaoSDKReturn {
  // ==================== 状态定义 ====================

  /** SDK 是否已加载 */
  const sdkLoaded = ref(false)
  /** 是否正在加载 */
  const loading = ref(false)
  /** 错误信息 */
  const error = ref<string | null>(null)
  /** PPT 渲染状态 */
  const renderingStatus = ref<PptRenderingStatus>('idle')
  /** Artifact ID（用于绑定到任务） */
  const artifactId = ref<number | null>(null)

  // ==================== 方法实现 ====================

  /**
   * 加载妙笔 SDK
   * 动态创建 script 标签加载 SDK 文件
   */
  const loadSDK = async (): Promise<void> => {
    // 如果已加载或正在加载，直接返回
    if (sdkLoaded.value || loading.value) {
      return
    }

    // 检查 window.Quanmiao 是否已存在
    if (window.Quanmiao) {
      sdkLoaded.value = true
      return
    }

    loading.value = true
    error.value = null

    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SDK_URL
      script.async = true

      script.onload = () => {
        sdkLoaded.value = true
        loading.value = false
        resolve()
      }

      script.onerror = () => {
        loading.value = false
        const errorMsg = '加载妙笔 SDK 失败，请检查网络连接'
        error.value = errorMsg
        reject(new Error(errorMsg))
      }

      document.head.appendChild(script)
    })
  }

  /**
   * 创建 PPT 实例
   * 调用妙笔 SDK 的 createPPT 方法
   *
   * @param options - 创建选项
   */
  const createPPT = (options: CreatePPTOptions): void => {
    if (!window.Quanmiao) {
      error.value = '妙笔 SDK 未加载，请先调用 loadSDK()'
      return
    }

    // 重置状态
    renderingStatus.value = 'making'
    artifactId.value = null

    // 包装 onMessage 回调以处理内部状态
    const wrappedOnMessage = (message: QuanmiaoMessage): void => {
      // 调用外部回调
      options.onMessage?.(message)

      // 处理内部状态
      switch (message.type) {
        case 'CHARGING':
          // 获取 artifactId
          if (typeof message.data === 'number') {
            artifactId.value = message.data
          } else if (typeof message.data === 'object' && message.data !== null) {
            const data = message.data as { artifactId?: number }
            if (typeof data.artifactId === 'number') {
              artifactId.value = data.artifactId
            }
          }
          break

        case 'SET_PPT_MAKING_STATUS':
          // 更新渲染状态
          if (typeof message.data === 'string') {
            const status = message.data
            if (status === 'done' || status === 'success' || status === 'completed') {
              renderingStatus.value = 'done'
            } else if (status === 'error' || status === 'failed') {
              renderingStatus.value = 'error'
              error.value = 'PPT 渲染失败'
            }
          } else if (typeof message.data === 'object' && message.data !== null) {
            const data = message.data as { status?: string; message?: string }
            if (data.status === 'done' || data.status === 'success') {
              renderingStatus.value = 'done'
            } else if (data.status === 'error' || data.status === 'failed') {
              renderingStatus.value = 'error'
              error.value = data.message || 'PPT 渲染失败'
            }
          }
          break

        case 'ERROR':
          renderingStatus.value = 'error'
          error.value = typeof message.data === 'string' ? message.data : 'PPT 渲染出错'
          break
      }
    }

    try {
      window.Quanmiao.createPPT({
        ...options,
        onMessage: wrappedOnMessage
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建 PPT 失败'
      error.value = errorMsg
      renderingStatus.value = 'error'
      throw err
    }
  }

  /**
   * 编辑 PPT 实例
   * 调用妙笔 SDK 的 editPPT 方法
   *
   * @param options - 编辑选项
   */
  const editPPT = (options: EditPPTOptions): void => {
    if (!window.Quanmiao) {
      error.value = '妙笔 SDK 未加载，请先调用 loadSDK()'
      return
    }

    try {
      window.Quanmiao.editPPT(options)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '编辑 PPT 失败'
      error.value = errorMsg
      throw err
    }
  }

  /**
   * 销毁 PPT 实例
   * 调用妙笔 SDK 的 deleteIframe 方法
   */
  const destroy = (): void => {
    if (!window.Quanmiao) {
      return
    }

    try {
      window.Quanmiao.deleteIframe()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '销毁 PPT 实例失败'
      error.value = errorMsg
      throw err
    } finally {
      // 重置渲染状态
      renderingStatus.value = 'idle'
      artifactId.value = null
    }
  }

  // ==================== 返回 ====================

  return {
    // 状态
    sdkLoaded,
    loading,
    error,
    renderingStatus,
    artifactId,
    // 方法
    loadSDK,
    createPPT,
    editPPT,
    destroy
  }
}

export default useQuanmiaoSDK
