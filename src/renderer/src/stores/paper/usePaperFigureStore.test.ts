import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperFigureItem } from '@shared/types/paper'
import { usePaperFigureStore } from './usePaperFigureStore'

interface ListFiguresResult {
  success: boolean
  data?: PaperFigureItem[]
}

// 构造测试用论文图片项；imagePath 使用 assets 相对路径，避免触发 base64 IPC 回退
function createFigure(id: string, paperId: string): PaperFigureItem {
  return {
    id,
    paperId,
    pageIndex: 0,
    blockIndex: 0,
    groupId: 'group-1',
    imagePath: `assets/page-1/${id}.png`,
    caption: `图 ${id}`,
    bbox: { x: 0, y: 0, width: 400, height: 300 }
  }
}

function stubWindowApi(listFigures: (paperId: string) => Promise<ListFiguresResult>): void {
  ;(globalThis as { window: Window }).window = {
    innerWidth: 1280,
    innerHeight: 800,
    api: { paper: { listFigures } }
  } as unknown as Window
}

function resetFigureStore(): void {
  usePaperFigureStore.setState({
    figuresByPaperId: {},
    figureLoadingByPaperId: {},
    showFigurePanel: false,
    activeFigure: null,
    figurePreviewPinned: false,
    figurePreviewImageRatio: 0.75
  })
}

test('图片列表未加载时，openFigurePreviewById 先加载图片再打开预览', async () => {
  resetFigureStore()
  const figure = createFigure('fig-1', 'paper-1')
  let listFiguresCalls = 0
  stubWindowApi(async () => {
    listFiguresCalls += 1
    return { success: true, data: [figure] }
  })

  await usePaperFigureStore.getState().openFigurePreviewById('paper-1', 'fig-1')

  assert.equal(listFiguresCalls, 1)
  const state = usePaperFigureStore.getState()
  assert.equal(state.activeFigure?.id, 'fig-1')
  assert.equal(state.activeFigure?.imagePath, 'lumina://paper/paper-1/assets/page-1/fig-1.png')
})

test('图片列表已缓存时，openFigurePreviewById 直接打开预览且不重复加载', async () => {
  resetFigureStore()
  const figure = createFigure('fig-1', 'paper-1')
  usePaperFigureStore.setState({ figuresByPaperId: { 'paper-1': [figure] } })
  let listFiguresCalls = 0
  stubWindowApi(async () => {
    listFiguresCalls += 1
    return { success: true, data: [] }
  })

  await usePaperFigureStore.getState().openFigurePreviewById('paper-1', 'fig-1')

  assert.equal(listFiguresCalls, 0)
  assert.equal(usePaperFigureStore.getState().activeFigure?.id, 'fig-1')
})

test('图片不存在时，openFigurePreviewById 不打开预览', async () => {
  resetFigureStore()
  stubWindowApi(async () => ({ success: true, data: [createFigure('fig-1', 'paper-1')] }))

  await usePaperFigureStore.getState().openFigurePreviewById('paper-1', 'fig-unknown')

  assert.equal(usePaperFigureStore.getState().activeFigure, null)
})
