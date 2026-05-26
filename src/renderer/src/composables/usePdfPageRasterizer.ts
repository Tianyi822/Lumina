/**
 * PDF 页面渲染器 composable
 * 提供逐页渲染 PDF 为图片的功能，基于 pdfjs-dist
 */

import {
  type PDFDocumentProxy,
  type PDFPageProxy,
  getDocument,
  type RenderTask,
  GlobalWorkerOptions
} from 'pdfjs-dist'

// Worker 初始化（模块顶层执行一次，使用本地路径）
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

/**
 * 页面尺寸信息
 */
export interface PageInfo {
  width: number
  height: number
}

/**
 * 渲染结果
 */
export interface RenderResult {
  base64: string // 不含 data:image/jpeg;base64, 前缀
  width: number
  height: number
}

export interface ValueRef<T> {
  value: T
}

function createValueRef<T>(value: T): ValueRef<T> {
  return { value }
}

/**
 * PDF 加载错误
 */
export class PdfLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'PdfLoadError'
  }
}

/**
 * PDF 渲染错误
 */
export class PdfRenderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'PdfRenderError'
  }
}

/**
 * PDF 页面渲染器 composable
 * 用于在渲染进程中将 PDF 逐页渲染为图片
 */
export function usePdfPageRasterizer(): {
  isLoaded: ValueRef<boolean>
  pageCount: ValueRef<number>
  loadPdf: (source: ArrayBuffer) => Promise<PageInfo[]>
  renderPage: (pageIndex: number, scale?: number) => Promise<RenderResult>
  dispose: () => void
} {
  // PDF 文档实例
  let pdfDoc: PDFDocumentProxy | null = null

  // 值状态
  const isLoaded = createValueRef(false)
  const pageCount = createValueRef(0)

  /**
   * 加载 PDF 文档
   * @param source PDF 文件的 ArrayBuffer
   * @returns 每页的尺寸信息数组
   */
  async function loadPdf(source: ArrayBuffer): Promise<PageInfo[]> {
    try {
      // 加载 PDF 文档
      const loadingTask = getDocument({
        data: source,
        // 禁用标准字体访问以避免 CORS 问题
        useSystemFonts: true,
        // 使用纯 CMap 而非预构建
        useWorkerFetch: false
      })

      pdfDoc = await loadingTask.promise
      pageCount.value = pdfDoc.numPages
      isLoaded.value = true

      // 获取每页尺寸信息
      const pageInfos: PageInfo[] = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 1.0 })
        pageInfos.push({
          width: viewport.width,
          height: viewport.height
        })
      }

      return pageInfos
    } catch (error) {
      dispose()
      throw new PdfLoadError('加载 PDF 失败', error)
    }
  }

  /**
   * 渲染指定页面为图片
   * @param pageIndex 页面索引（从 0 开始）
   * @param scale 缩放比例，默认 2.0
   * @returns 渲染结果（base64 + 尺寸）
   */
  async function renderPage(pageIndex: number, scale: number = 2.0): Promise<RenderResult> {
    if (!pdfDoc || !isLoaded.value) {
      throw new PdfRenderError('PDF 未加载，请先调用 loadPdf')
    }

    if (pageIndex < 0 || pageIndex >= pageCount.value) {
      throw new PdfRenderError(`页面索引无效: ${pageIndex}，有效范围: 0-${pageCount.value - 1}`)
    }

    let renderTask: RenderTask | null = null

    try {
      // pdfjs 页码从 1 开始
      const page: PDFPageProxy = await pdfDoc.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale })

      // 创建 Canvas
      const canvas = document.createElement('canvas')
      const canvasContext = canvas.getContext('2d', {
        alpha: false, // 不需要透明通道，提升性能
        willReadFrequently: false
      })

      if (!canvasContext) {
        throw new PdfRenderError('创建 Canvas 2D 上下文失败')
      }

      canvas.width = viewport.width
      canvas.height = viewport.height

      // 渲染页面到 Canvas
      renderTask = page.render({
        canvas,
        canvasContext,
        viewport
      })

      await renderTask.promise
      renderTask = null

      // 导出为 JPEG（质量 0.85）
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

      // 去掉 data:image/jpeg;base64, 前缀
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')

      // 清理 Canvas
      canvas.width = 0
      canvas.height = 0

      return {
        base64,
        width: viewport.width,
        height: viewport.height
      }
    } catch (error) {
      // 取消正在进行的渲染任务
      if (renderTask) {
        renderTask.cancel()
      }
      throw new PdfRenderError(`渲染页面 ${pageIndex} 失败`, error)
    }
  }

  /**
   * 释放资源
   */
  function dispose(): void {
    if (pdfDoc) {
      try {
        pdfDoc.destroy()
      } catch {
        // 忽略销毁错误
      }
      pdfDoc = null
    }
    isLoaded.value = false
    pageCount.value = 0
  }

  return {
    isLoaded,
    pageCount,
    loadPdf,
    renderPage,
    dispose
  }
}
