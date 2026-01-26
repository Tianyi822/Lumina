import { ipcRenderer } from 'electron'

/**
 * 创建 IPC 调用器的辅助函数
 * @param namespace 命名空间前缀
 * @param methods 方法名列表
 * @returns API 对象
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
 * @param channel 事件通道名称
 * @param callback 回调函数
 * @returns 取消监听的函数
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
