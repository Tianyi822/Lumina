const common = {
  imageGifUnsupported: '不支持 GIF 动图格式',
  imageTypeUnsupported: '图片格式不支持，仅支持 {{extensions}}',
  imageTooLarge: '图片 "{{name}}" 过大（{{size}}MB），最大支持 5MB',
  // ===== 渲染进程图片上传与压缩运行时文案（六期 T9）=====
  imageMaxCountReached: '已达到最大图片数量限制（{{max}}张）',
  imageOverLimitSkipped_one: '超出数量限制，已忽略 {{count}} 张图片',
  imageOverLimitSkipped_other: '超出数量限制，已忽略 {{count}} 张图片',
  imageValidationFailed: '图片 "{{name}}" 验证失败',
  imageCompressFailed: '图片 "{{name}}" 压缩失败: {{reason}}',
  imageLoadFailed: '无法加载图片: {{name}}',
  imageReadFailed: '无法读取文件: {{name}}',
  imageLoadFailedBare: '无法加载图片',
  canvasContextFailed: '无法创建 Canvas 上下文'
}

export default common
