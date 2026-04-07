function parseUrlSafely(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isFileUrl(value: string | undefined | null): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    return false
  }

  return parseUrlSafely(value)?.protocol === 'file:'
}

export function fileUrlToPath(fileUrl: string): string | null {
  const parsedUrl = parseUrlSafely(fileUrl)
  if (!parsedUrl || parsedUrl.protocol !== 'file:') {
    return null
  }

  const decodedPath = decodeURIComponent(parsedUrl.pathname)
  if (!decodedPath) {
    return null
  }

  if (/^\/[A-Za-z]:\//.test(decodedPath)) {
    return decodedPath.slice(1)
  }

  return decodedPath
}

export function getImageMimeTypeFromPath(filePath: string): string {
  const normalizedPath = filePath.toLowerCase()

  if (normalizedPath.endsWith('.png')) {
    return 'image/png'
  }

  if (normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalizedPath.endsWith('.webp')) {
    return 'image/webp'
  }

  if (normalizedPath.endsWith('.gif')) {
    return 'image/gif'
  }

  if (normalizedPath.endsWith('.svg')) {
    return 'image/svg+xml'
  }

  return 'image/png'
}

export function buildBase64DataUrl(base64Data: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64Data.trim()}`
}
