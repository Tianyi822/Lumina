/**
 * paper 同步 key 纯函数测试：生成/解析/前缀判定/异常输入。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isPaperKey,
  makePaperAnnotationsKey,
  makePaperMetaKey,
  makePaperPackKey,
  parsePaperKey
} from './paperSyncKeys'

const PAPER_ID = '0154b2ab-cf67-460e-88c3-0c995f175863'

test('make 三个 key 并可被 isPaperKey 识别', () => {
  assert.equal(makePaperMetaKey(PAPER_ID), `paper-meta-${PAPER_ID}`)
  assert.equal(makePaperAnnotationsKey(PAPER_ID), `paper-annotations-${PAPER_ID}`)
  assert.equal(makePaperPackKey(PAPER_ID), `paper-pack-${PAPER_ID}`)
  assert.ok(isPaperKey(makePaperMetaKey(PAPER_ID)))
  assert.ok(isPaperKey(makePaperAnnotationsKey(PAPER_ID)))
  assert.ok(isPaperKey(makePaperPackKey(PAPER_ID)))
})

test('parsePaperKey 解析三种 kind', () => {
  assert.deepEqual(parsePaperKey(makePaperMetaKey(PAPER_ID)), { kind: 'meta', paperId: PAPER_ID })
  assert.deepEqual(parsePaperKey(makePaperAnnotationsKey(PAPER_ID)), {
    kind: 'annotations',
    paperId: PAPER_ID
  })
  assert.deepEqual(parsePaperKey(makePaperPackKey(PAPER_ID)), { kind: 'pack', paperId: PAPER_ID })
})

test('其他数据域 key 不识别', () => {
  assert.equal(isPaperKey('knowledge-bases'), false)
  assert.equal(isPaperKey('knowledge-file-abc'), false)
  assert.equal(isPaperKey('writer-doc-abc'), false)
  assert.equal(isPaperKey('0154b2ab-cf67-460e-88c3-0c995f175863'), false)
  assert.equal(parsePaperKey('knowledge-bases'), null)
})

test('非法 paperId 返回 null', () => {
  assert.equal(parsePaperKey('paper-meta-'), null)
  assert.equal(parsePaperKey('paper-meta-bad id'), null)
  assert.equal(parsePaperKey('paper-pack-'), null)
  assert.equal(parsePaperKey('paper-annotations-'), null)
})
