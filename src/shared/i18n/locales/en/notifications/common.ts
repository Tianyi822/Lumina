import type { Resources } from '../../zh'

const common: Resources['notifications']['common'] = {
  imageGifUnsupported: 'Animated GIF is not supported',
  imageTypeUnsupported: 'Unsupported image format. Only {{extensions}} are supported',
  imageTooLarge: 'Image "{{name}}" is too large ({{size}}MB); the limit is 5MB'
}

export default common
