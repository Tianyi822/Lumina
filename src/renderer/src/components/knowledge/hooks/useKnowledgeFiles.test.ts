// React act 环境标志须在加载 react 前设置，否则 act() 会告警
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { initI18n } from '@renderer/i18n'
import { useFileStore } from '@renderer/stores/fileStore'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import type { FileItem } from '@shared/types/knowledge'

// useKnowledgeFiles 间接依赖的 knowledgeIndexStore 在模块加载时即调用
// window.api.onFileProgress，须在动态导入前准备好 globalThis.window。
// 故 useKnowledgeFiles 采用动态导入，避免静态导入触发顶层副作用。

// hooks 内 useTranslation 依赖全局实例：先初始化（测试环境无 localStorage，默认语言恒为 zh，既有中文断言不受影响）
await initI18n()
type UseKnowledgeFilesApi = {
  handleUnlinkFile: (fileId: string, onReindex?: () => Promise<void>) => Promise<void>
}

function createFile(): FileItem {
  return {
    id: 'file-1',
    name: 'removed.md',
    filePath: 'removed.md',
    absolutePath: '/tmp/removed.md',
    fileType: 'md',
    size: 12,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    usedByKBIds: ['kb-1'],
    sourceKind: 'uploaded'
  }
}

test('handleUnlinkFile 成功后不调用 removeFileIndex 且不触发重新索引', async (t) => {
  const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>')
  const testGlobal = globalThis as unknown as {
    window?: Window
    document?: Document
  }
  const originalWindow = testGlobal.window
  const originalDocument = testGlobal.document
  let removeFileIndexCalls = 0
  let reindexCalls = 0
  let statsRefreshCalls = 0
  let unlinkedFileId = ''
  let unlinkCalls = 0
  let handleUnlinkFile: UseKnowledgeFilesApi['handleUnlinkFile'] | null = null
  let root: Root | null = null

  testGlobal.window = Object.assign(window, {
    api: {
      knowledge: {
        removeFileIndex: async () => {
          removeFileIndexCalls++
          return { success: true }
        }
      },
      onFileProgress: () => () => {},
      logger: {
        info: async () => ({ success: true }),
        error: async () => ({ success: true }),
        warn: async () => ({ success: true }),
        debug: async () => ({ success: true })
      }
    }
  }) as unknown as Window
  testGlobal.document = document as unknown as Document

  const originalFileState = useFileStore.getState()
  t.after(async () => {
    // 先卸载组件并排空微任务，避免异步回调在 window 被删除后才触发
    if (root) {
      await act(async () => {
        root!.unmount()
      })
    }
    await new Promise((resolve) => setImmediate(resolve))
    useFileStore.setState(originalFileState, true)
    useNotificationCenterStore.setState({
      notifications: [],
      confirmState: {
        visible: false,
        message: '',
        title: '',
        danger: false,
        resolve: null
      }
    })
    if (originalWindow) {
      testGlobal.window = originalWindow
    } else {
      delete testGlobal.window
    }
    if (originalDocument) {
      testGlobal.document = originalDocument
    } else {
      delete testGlobal.document
    }
  })

  useFileStore.setState({
    ...originalFileState,
    getFilesByKBId: async () => [createFile()],
    unlinkFileFromKB: async (fileId: string, kbId: string) => {
      unlinkCalls++
      assert.equal(fileId, 'file-1')
      assert.equal(kbId, 'kb-1')
      return { success: true }
    }
  })

  const { useKnowledgeFiles } = await import('./useKnowledgeFiles')

  function Harness(): null {
    const api = useKnowledgeFiles(
      'kb-1',
      () => undefined,
      (_kbId, fileId) => {
        unlinkedFileId = fileId
      },
      async () => {
        statsRefreshCalls++
      }
    )
    handleUnlinkFile = api.handleUnlinkFile
    return null
  }

  const container = document.getElementById('root')
  assert.ok(container)
  root = createRoot(container as unknown as Element)
  await act(async () => {
    root.render(React.createElement(Harness))
  })

  assert.equal(typeof handleUnlinkFile, 'function')
  const unlinkPromise = handleUnlinkFile!('file-1', async () => {
    reindexCalls++
  })
  await Promise.resolve()
  assert.equal(
    useNotificationCenterStore.getState().confirmState.message,
    '将从知识库移除该文档，并删除对应索引。'
  )
  useNotificationCenterStore.getState().resolveConfirm(true)
  await act(async () => {
    await unlinkPromise
  })

  assert.equal(unlinkCalls, 1)
  assert.equal(statsRefreshCalls, 1)
  assert.equal(unlinkedFileId, 'file-1')
  assert.equal(removeFileIndexCalls, 0)
  assert.equal(reindexCalls, 0)
})
