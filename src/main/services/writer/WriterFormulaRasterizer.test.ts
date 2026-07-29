import assert from 'node:assert/strict'
import test from 'node:test'
import { WriterFormulaRasterizer } from './WriterFormulaRasterizer'

/** 1x1 透明 PNG */
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

test('rasterize 成功时返回 PNG 缓冲', async () => {
  const rasterizer = new WriterFormulaRasterizer({
    captureHtmlToPng: async (html) => {
      assert.match(html, /default-src 'none'/)
      assert.match(html, /katex/)
      assert.match(html, /E = mc\^2|E = mc/)
      return VALID_PNG
    }
  })

  const result = await rasterizer.rasterize('E = mc^2', true)
  assert.equal(result.success, true)
  assert.ok(result.data)
  assert.equal(result.data.subarray(0, 8).toString('hex'), VALID_PNG.subarray(0, 8).toString('hex'))
})

test('capture 失败时返回错误结果', async () => {
  const rasterizer = new WriterFormulaRasterizer({
    captureHtmlToPng: async () => {
      throw new Error('截图失败')
    }
  })

  const result = await rasterizer.rasterize('a + b', false)
  assert.equal(result.success, false)
  assert.equal(result.code, 'io_error')
  assert.match(result.error ?? '', /截图失败/)
})

test('空 LaTeX 返回 invalid_input', async () => {
  const rasterizer = new WriterFormulaRasterizer({
    captureHtmlToPng: async () => VALID_PNG
  })
  const result = await rasterizer.rasterize('   ', true)
  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_input')
})
