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
  onMessage?: (type: QuanmiaoMessageType | string, data?: unknown) => void
}

/**
 * 妙笔 SDK 消息类型
 */
export type QuanmiaoMessageType =
  | 'CHARGING'
  | 'SET_PPT_MAKING_STATUS'
  | 'GENERATE_PPT_SUCCESS'
  | 'ERROR'

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
  onMessage?: (type: QuanmiaoMessageType | string, data?: unknown) => void
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

/** 使用模块级状态，确保多个调用方共享同一份妙笔 SDK 状态 */
const sdkLoaded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const renderingStatus = ref<PptRenderingStatus>('idle')
const artifactId = ref<number | null>(null)

function extractArtifactId(data: unknown): number | null {
  if (typeof data === 'number' && Number.isFinite(data)) {
    return data
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  const payload = data as { id?: unknown; artifactId?: unknown }
  const candidate = payload.artifactId ?? payload.id

  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

function extractStatus(data: unknown): string {
  if (typeof data === 'string' || typeof data === 'number') {
    return String(data)
  }

  if (!data || typeof data !== 'object') {
    return ''
  }

  const payload = data as { status?: unknown }
  const status = payload.status

  return typeof status === 'string' || typeof status === 'number' ? String(status) : ''
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) {
    return data
  }

  if (!data || typeof data !== 'object') {
    return fallback
  }

  const payload = data as {
    msg?: unknown
    message?: unknown
    error?: unknown
  }

  const candidate = payload.msg ?? payload.message ?? payload.error
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback
}

export function useQuanmiaoSDK(): UseQuanmiaoSDKReturn {
  // ==================== 方法实现 ====================

  /**
   * 加载妙笔 SDK
   * 动态创建 script 标签加载 SDK 文件
   */
  const loadSDK = async (): Promise<void> => {
    // 如果已加载或正在加载，直接返回
    if (sdkLoaded.value || loading.value) {
      void window.api.logger?.debug('[QuanmiaoSDK] 跳过 SDK 加载', {
        sdkLoaded: sdkLoaded.value,
        loading: loading.value
      })
      return
    }

    // 检查 window.Quanmiao 是否已存在
    if (window.Quanmiao) {
      sdkLoaded.value = true
      void window.api.logger?.info('[QuanmiaoSDK] 检测到已有妙笔 SDK 实例')
      return
    }

    loading.value = true
    error.value = null

    void window.api.logger?.info('[QuanmiaoSDK] 开始加载妙笔 SDK', {
      sdkUrl: SDK_URL
    })

    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SDK_URL
      script.async = true
      const handleSecurityPolicyViolation = (event: SecurityPolicyViolationEvent): void => {
        const blockedURI = event.blockedURI || ''
        const originalPolicy = event.originalPolicy || ''
        const effectiveDirective = event.effectiveDirective || ''

        const isQuanmiaoRelated =
          blockedURI.includes('quanmiao') ||
          blockedURI.includes('aippt') ||
          blockedURI === 'eval' ||
          originalPolicy.includes('unsafe-eval') ||
          effectiveDirective.includes('script-src')

        if (!isQuanmiaoRelated) {
          return
        }

        void window.api.logger?.warn('[QuanmiaoSDK] CSP 拦截了妙笔资源加载', {
          blockedURI,
          effectiveDirective,
          violatedDirective: event.violatedDirective,
          originalPolicy
        })
      }

      document.addEventListener('securitypolicyviolation', handleSecurityPolicyViolation)

      script.onload = () => {
        sdkLoaded.value = true
        loading.value = false
        document.removeEventListener('securitypolicyviolation', handleSecurityPolicyViolation)
        void window.api.logger?.info('[QuanmiaoSDK] 妙笔 SDK 加载成功')
        resolve()
      }

      script.onerror = () => {
        loading.value = false
        document.removeEventListener('securitypolicyviolation', handleSecurityPolicyViolation)
        const errorMsg = '加载妙笔 SDK 失败，请检查网络连接'
        error.value = errorMsg
        void window.api.logger?.error('[QuanmiaoSDK] 妙笔 SDK 加载失败', {
          sdkUrl: SDK_URL
        })
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
    const wrappedOnMessage = (type: QuanmiaoMessageType | string, data?: unknown): void => {
      switch (type) {
        case 'CHARGING':
          renderingStatus.value = 'making'
          break

        case 'SET_PPT_MAKING_STATUS':
          {
            const status = extractStatus(data)
            if (status === '0' || status === 'done' || status === 'success') {
              renderingStatus.value = 'done'
            } else if (status === '1' || status === 'making' || status === 'processing') {
              renderingStatus.value = 'making'
            } else if (status === '-1' || status === 'error' || status === 'failed') {
              renderingStatus.value = 'error'
              error.value = extractErrorMessage(data, 'PPT 渲染失败')
            }
          }
          break

        case 'GENERATE_PPT_SUCCESS': {
          const nextArtifactId = extractArtifactId(data)
          if (nextArtifactId !== null) {
            artifactId.value = nextArtifactId
          }
          break
        }

        case 'ERROR':
          renderingStatus.value = 'error'
          error.value = extractErrorMessage(data, 'PPT 渲染出错')
          break
      }

      // 先更新内部状态，再通知外层，避免外层读取到旧状态
      options.onMessage?.(type, data)
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
      error.value = null
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
