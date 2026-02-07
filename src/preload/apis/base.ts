import { ipcRenderer } from 'electron'

/**
 * 创建 IPC 调用器的辅助函数
 * 根据命名空间和方法列表自动生成调用函数
 */
export function createIpcInvoker<
  T extends Record<string, (...args: unknown[]) => Promise<unknown>>
>(namespace: string, methods: string[]): T {
  const api = {} as T
  for (const method of methods) {
    api[method as keyof T] = ((...args: unknown[]) => {
      return ipcRenderer.invoke(`${namespace}:${method}`, ...args)
    }) as T[keyof T]
  }
  return api
}

/**
 * 创建事件监听器的辅助函数
 * 返回一个取消监听的函数
 */
export function createIpcListener<T = unknown>(
  channel: string,
  callback: (data: T) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T): void => {
    callback(data)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}
