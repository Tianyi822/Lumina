import type { Resources } from '../../zh'

const common: Resources['notifications']['common'] = {
  imageGifUnsupported: 'Animated GIF is not supported',
  imageTypeUnsupported: 'Unsupported image format. Only {{extensions}} are supported.',
  imageTooLarge: 'Image "{{name}}" is too large ({{size}}MB); the limit is 5MB.',
  // ===== Renderer image upload/compression runtime copy (phase 6, T9) =====
  imageMaxCountReached: 'Reached the maximum image limit ({{max}})',
  imageOverLimitSkipped_one: 'Over the limit; {{count}} image was ignored.',
  imageOverLimitSkipped_other: 'Over the limit; {{count}} images were ignored.',
  imageValidationFailed: 'Image "{{name}}" failed validation',
  imageCompressFailed: 'Failed to compress image "{{name}}": {{reason}}',
  imageLoadFailed: 'Failed to load the image: {{name}}',
  imageReadFailed: 'Failed to read the file: {{name}}',
  imageLoadFailedBare: 'Failed to load the image',
  canvasContextFailed: 'Failed to create the canvas context'
}

export default common
