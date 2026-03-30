/**
 * 图片压缩工具模块
 * 使用 Canvas API 在渲染进程中完成图片压缩和 Base64 编码
 */

// ==================== 常量 ====================

/** 支持的图片扩展名 */
export const IMAGE_SUPPORTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif'
]

/** 支持的 MIME 类型 */
export const IMAGE_SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff'
]

/** MIME 类型到默认扩展名的映射 */
const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff'
}

/** 图片文件选择器 accept 字符串 */
export const IMAGE_ACCEPT_STRING = IMAGE_SUPPORTED_EXTENSIONS.join(',')

/** 单张图片最大大小：5MB */
export const IMAGE_MAX_SIZE = 5 * 1024 * 1024

/** 单次上传最多图片数量 */
export const IMAGE_MAX_COUNT = 10

/** 压缩后最大尺寸（宽或高） */
const IMAGE_MAX_DIMENSION = 2048

/** JPEG 压缩质量 */
const IMAGE_COMPRESS_QUALITY = 0.85

/** 缩略图最大边长 */
const THUMBNAIL_MAX_SIZE = 200

// ==================== 类型 ====================

/** 压缩后的图片结果 */
export interface CompressedImage {
  /** 原始文件名 */
  fileName: string
  /** MIME 类型 */
  mimeType: string
  /** 压缩后宽度 */
  width: number
  /** 压缩后高度 */
  height: number
  /** 原始文件大小（字节） */
  originalSize: number
  /** 压缩后大小（字节） */
  compressedSize: number
  /** 完整 data URL */
  base64Data: string
  /** 缩略图 data URL */
  thumbnailData: string
}

/** 图片验证结果 */
export interface ImageValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 错误信息 */
  error?: string
}

// ==================== 工具函数 ====================

/**
 * 获取文件扩展名（小写，带点号）
 */
function getExtension(fileName: string): string {
  const parts = fileName.split('.')
  if (parts.length < 2) return ''
  return '.' + parts.pop()!.toLowerCase()
}

/**
 * 获取支持的图片 MIME 类型
 */
function getSupportedMimeType(file: Pick<File, 'type'>): string {
  const mimeType = file.type.toLowerCase()
  return IMAGE_SUPPORTED_MIME_TYPES.includes(mimeType) ? mimeType : ''
}

/**
 * 推导图片文件扩展名
 * 优先使用文件名扩展名，若缺失则回退到 MIME 类型
 */
function resolveImageExtension(file: Pick<File, 'name' | 'type'>): string {
  const ext = getExtension(file.name)
  if (IMAGE_SUPPORTED_EXTENSIONS.includes(ext)) {
    return ext
  }

  return IMAGE_EXTENSION_BY_MIME_TYPE[file.type.toLowerCase()] || ''
}

/**
 * 规范化图片文件名
 * 处理剪贴板图片没有扩展名的情况，确保后续校验和展示稳定
 */
export function normalizeImageFile(file: File, index: number = 0): File {
  const resolvedExtension = resolveImageExtension(file)
  const currentExtension = getExtension(file.name)

  if (file.name && (!resolvedExtension || currentExtension === resolvedExtension)) {
    return file
  }

  const baseName =
    file.name.replace(/\.[^.]+$/, '').trim() || `clipboard-image-${Date.now()}-${index + 1}`
  const normalizedName = resolvedExtension ? `${baseName}${resolvedExtension}` : baseName

  return new File([file], normalizedName, {
    type: file.type,
    lastModified: file.lastModified
  })
}

/**
 * 判断文件是否为支持的图片格式
 */
export function isImageFile(file: File): boolean {
  return Boolean(resolveImageExtension(file) || getSupportedMimeType(file))
}

/**
 * 验证图片文件
 * 检查格式和大小限制
 */
export function validateImageFile(file: File): ImageValidationResult {
  const ext = getExtension(file.name)
  const mimeType = file.type.toLowerCase()

  // 检查是否为不支持的动图格式
  if (ext === '.gif' || mimeType === 'image/gif') {
    return { valid: false, error: `不支持 GIF 动图格式` }
  }

  // 检查是否为支持的图片格式
  if (!resolveImageExtension(file) && !getSupportedMimeType(file)) {
    return {
      valid: false,
      error: `图片格式不支持，仅支持 ${IMAGE_SUPPORTED_EXTENSIONS.join(', ')}`
    }
  }

  // 检查文件大小
  if (file.size > IMAGE_MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return { valid: false, error: `图片 "${file.name}" 过大（${sizeMB}MB），最大支持 5MB` }
  }

  return { valid: true }
}

/**
 * 将 File 加载为 HTMLImageElement
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`无法加载图片: ${file.name}`))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error(`无法读取文件: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * 将 data URL 加载为 HTMLImageElement
 */
function loadImageFromDataURL(dataURL: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('无法加载图片'))
    img.src = dataURL
  })
}

/**
 * 计算缩放后的尺寸，保持比例
 */
function calculateScaledSize(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height }
  }

  const ratio = Math.min(maxSize / width, maxSize / height)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  }
}

/**
 * 确定输出 MIME 类型
 * BMP/TIFF 统一转为 JPEG；PNG/WebP 原始大小 < 1MB 时保留原格式
 */
function determineOutputMimeType(file: File): string {
  const ext = resolveImageExtension(file)
  const mimeType = getSupportedMimeType(file)

  // BMP 和 TIFF 不适合 Web，转为 JPEG
  if (['.bmp', '.tiff', '.tif'].includes(ext) || ['image/bmp', 'image/tiff'].includes(mimeType)) {
    return 'image/jpeg'
  }

  // PNG 和 WebP：原始大小小于 1MB 时保留原格式（保持透明通道等）
  if (
    (['.png', '.webp'].includes(ext) || ['image/png', 'image/webp'].includes(mimeType)) &&
    file.size < 1024 * 1024
  ) {
    return mimeType || (ext === '.webp' ? 'image/webp' : 'image/png')
  }

  // 其他情况默认 JPEG
  return 'image/jpeg'
}

/**
 * 计算 data URL 的字节大小
 */
function getDataURLSize(dataURL: string): number {
  // data URL 格式: data:mime;base64,<data>
  const base64Part = dataURL.split(',')[1]
  if (!base64Part) return 0
  // Base64 编码约占原始数据的 4/3
  return Math.ceil((base64Part.length * 3) / 4)
}

/**
 * 压缩图片
 * 使用 Canvas API 缩放并重新编码图片
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const img = await loadImageFromFile(file)

  // 计算缩放尺寸
  const scaled = calculateScaledSize(img.width, img.height, IMAGE_MAX_DIMENSION)

  // 创建 Canvas 进行压缩
  const canvas = document.createElement('canvas')
  canvas.width = scaled.width
  canvas.height = scaled.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文')
  }

  // 绘制图片
  ctx.drawImage(img, 0, 0, scaled.width, scaled.height)

  // 确定输出格式
  const outputMimeType = determineOutputMimeType(file)
  const quality = outputMimeType === 'image/png' ? undefined : IMAGE_COMPRESS_QUALITY

  // 导出为 data URL
  const base64Data = canvas.toDataURL(outputMimeType, quality)
  const compressedSize = getDataURLSize(base64Data)

  // 生成缩略图
  const thumbnailData = await generateThumbnail(base64Data, THUMBNAIL_MAX_SIZE)

  return {
    fileName: file.name,
    mimeType: outputMimeType,
    width: scaled.width,
    height: scaled.height,
    originalSize: file.size,
    compressedSize,
    base64Data,
    thumbnailData
  }
}

/**
 * 生成缩略图
 * 缩小图片到指定最大边长，用于 UI 快速预览
 */
export async function generateThumbnail(
  base64Data: string,
  maxSize: number = THUMBNAIL_MAX_SIZE
): Promise<string> {
  const img = await loadImageFromDataURL(base64Data)

  const scaled = calculateScaledSize(img.width, img.height, maxSize)

  const canvas = document.createElement('canvas')
  canvas.width = scaled.width
  canvas.height = scaled.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文')
  }

  ctx.drawImage(img, 0, 0, scaled.width, scaled.height)

  return canvas.toDataURL('image/jpeg', 0.7)
}
