import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateVirtualZoomTargetScrollTop,
  captureVirtualZoomAnchorFromItems
} from './paperZoomScrollRestore.ts'

const segments = [{ stableId: 'seg-0' }, { stableId: 'seg-1' }, { stableId: 'seg-2' }]

test('虚拟锚点捕获视口中心所在的段落和相对位置', () => {
  const anchor = captureVirtualZoomAnchorFromItems(
    150,
    100,
    [
      { index: 0, start: 0, size: 100 },
      { index: 1, start: 100, size: 200 },
      { index: 2, start: 320, size: 80 }
    ],
    segments
  )

  assert.deepEqual(anchor, {
    stableId: 'seg-1',
    offsetRatio: 0.5
  })
})

test('视口中心落在 gap 时选择最近的虚拟项', () => {
  const anchor = captureVirtualZoomAnchorFromItems(
    74,
    100,
    [
      { index: 0, start: 0, size: 100 },
      { index: 1, start: 140, size: 80 },
      { index: 2, start: 240, size: 80 }
    ],
    segments
  )

  assert.deepEqual(anchor, {
    stableId: 'seg-1',
    offsetRatio: 0
  })
})

test('虚拟锚点恢复目标 scrollTop 与列表坐标一致', () => {
  assert.equal(
    calculateVirtualZoomTargetScrollTop({ index: 1, start: 400, size: 80 }, 0.25, 200),
    320
  )
})

test('虚拟锚点恢复会限制段内比例范围', () => {
  assert.equal(
    calculateVirtualZoomTargetScrollTop({ index: 1, start: 400, size: 80 }, -0.5, 200),
    300
  )
  assert.equal(
    calculateVirtualZoomTargetScrollTop({ index: 1, start: 400, size: 80 }, 1.5, 200),
    380
  )
})
