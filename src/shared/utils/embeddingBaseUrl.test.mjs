import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmbeddingBaseUrl } from './embeddingBaseUrl.ts'

test('去掉末尾 /embeddings，避免 SDK 请求 /embeddings/embeddings', () => {
  assert.equal(
    normalizeEmbeddingBaseUrl('http://127.0.0.1:1234/v1/embeddings'),
    'http://127.0.0.1:1234/v1'
  )
  assert.equal(
    normalizeEmbeddingBaseUrl('http://127.0.0.1:1234/v1/embeddings/'),
    'http://127.0.0.1:1234/v1'
  )
})

test('仅主机端口时自动补 /v1', () => {
  assert.equal(normalizeEmbeddingBaseUrl('http://127.0.0.1:1234'), 'http://127.0.0.1:1234/v1')
})

test('已是正确 baseUrl 时保持不变', () => {
  assert.equal(normalizeEmbeddingBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1')
})
