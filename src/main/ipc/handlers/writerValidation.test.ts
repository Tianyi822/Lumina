import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDeleteWriterPayload,
  validateImportWriterAssetPayload,
  validateSaveWriterPayload,
  validateWriterFavorite,
  validateWriterFolderId,
  validateWriterFolderName,
  validateWriterTitle
} from './writerValidation'

test('永久删除拒绝路径和空 ID', () => {
  assert.equal(validateDeleteWriterPayload('../papers'), '无效的文档 ID')
  assert.equal(validateDeleteWriterPayload(''), '无效的文档 ID')
  assert.equal(validateDeleteWriterPayload('writer-12345678'), null)
})

test('图片导入拒绝超限字节', () => {
  const result = validateImportWriterAssetPayload({
    documentId: 'writer-12345678',
    fileName: 'large.png',
    declaredMimeType: 'image/png',
    bytes: new Uint8Array(20 * 1024 * 1024 + 1)
  })
  assert.equal(result, '单张图片不能超过 20MB')
})

test('图片导入拒绝路径文件名和非二进制内容', () => {
  assert.equal(
    validateImportWriterAssetPayload({
      documentId: 'writer-12345678',
      fileName: '../unsafe.png',
      declaredMimeType: 'image/png',
      bytes: new Uint8Array([1])
    }),
    '无效的图片文件名'
  )
  assert.equal(
    validateImportWriterAssetPayload({
      documentId: 'writer-12345678',
      fileName: 'safe.png',
      declaredMimeType: 'image/png',
      bytes: [1]
    }),
    '无效的图片字节'
  )
})

test('保存、标题、文件夹和收藏参数拒绝错误类型', () => {
  assert.equal(
    validateSaveWriterPayload({
      documentId: 'writer-12345678',
      expectedRevision: -1,
      title: '错误修订',
      content: { type: 'doc', content: [] }
    }),
    false
  )
  assert.equal(validateWriterTitle(undefined, true), null)
  assert.equal(validateWriterTitle('', false), '文档标题不能为空')
  assert.equal(validateWriterFolderId(undefined, true), null)
  assert.equal(validateWriterFolderId('../folder', false), '无效的文件夹 ID')
  assert.equal(validateWriterFolderName('   '), '无效的文件夹名称')
  assert.equal(validateWriterFavorite('true'), '无效的收藏状态')
})
