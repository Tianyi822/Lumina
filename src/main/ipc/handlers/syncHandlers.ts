import { ipcMain } from 'electron'
import { getSyncService } from '@main/services/sync'
import { getConfigSyncService } from '@main/services/sync/config'
import { getSessionSyncService } from '@main/services/sync/session'
import { getWriterSyncService } from '@main/services/sync/writer'
import { getKnowledgeSyncService } from '@main/services/sync/knowledge'
import { getPaperSyncService } from '@main/services/sync/paper'

/**
 * 注册同步相关 IPC 处理程序。
 * 通道命名 sync:method，全部返回统一 SyncResult。
 */
export function registerSyncHandlers(): void {
  // 服务发现（用于设置页验证 Relay 地址）
  ipcMain.handle('sync:discover', (_event, relayUrl: string) => {
    return getSyncService().discover(relayUrl)
  })

  // 连接（注册/登录自动分流）；成功后启动全部五个模块的同步引擎
  ipcMain.handle(
    'sync:connect',
    async (_event, relayUrl: string, username: string, password: string) => {
      const result = await getSyncService().connect(relayUrl, username, password)
      if (result.success) {
        getSessionSyncService().start()
        getConfigSyncService().start()
        getWriterSyncService().start()
        getKnowledgeSyncService().start()
        getPaperSyncService().start()
      }
      return result
    }
  )

  // 会话续期（无需密码）；成功后启动全部五个模块的同步引擎
  ipcMain.handle('sync:renewSession', async () => {
    const result = await getSyncService().renewSession()
    if (result.success) {
      getSessionSyncService().start()
      getConfigSyncService().start()
      getWriterSyncService().start()
      getKnowledgeSyncService().start()
      getPaperSyncService().start()
    }
    return result
  })

  // 获取当前同步状态
  ipcMain.handle('sync:getStatus', () => {
    return { success: true, data: getSyncService().getStatus() }
  })

  // 断开连接并清除本地身份；同时停止全部五个模块的同步定时器
  ipcMain.handle('sync:disconnect', () => {
    getSessionSyncService().stop()
    getConfigSyncService().stop()
    getWriterSyncService().stop()
    getKnowledgeSyncService().stop()
    getPaperSyncService().stop()
    return getSyncService().disconnect()
  })

  // 刷新 bootstrap 根状态
  ipcMain.handle('sync:refreshBootstrap', () => {
    return getSyncService().refreshBootstrap()
  })

  // 生成六位同步码
  ipcMain.handle('sync:generateSyncCode', () => {
    return getSyncService().generateSyncCode()
  })

  // 兑换六位同步码；成功后立即对全部五个模块触发一轮对账同步
  ipcMain.handle('sync:redeemSyncCode', async (_event, code: string) => {
    const result = await getSyncService().redeemSyncCode(code)
    if (result.success) {
      getSessionSyncService().kickoff()
      getConfigSyncService().kickoff()
      getWriterSyncService().kickoff()
      getKnowledgeSyncService().kickoff()
      getPaperSyncService().kickoff()
    }
    return result
  })

  // 列出同步组内设备
  ipcMain.handle('sync:listDevices', () => {
    return getSyncService().listDevices()
  })

  // 吊销组内设备
  ipcMain.handle('sync:revokeDevice', (_event, deviceId: string) => {
    return getSyncService().revokeDevice(deviceId)
  })

  // 放弃其他同步组
  ipcMain.handle('sync:discardOtherGroups', () => {
    return getSyncService().discardOtherGroups()
  })

  // 创建 WebSocket 事件票据
  ipcMain.handle('sync:createEventTicket', () => {
    return getSyncService().createEventTicket()
  })

  // 断线重连后的全量对账
  ipcMain.handle('sync:reconcile', () => {
    return getSyncService().reconcile()
  })

  // 手动触发会话同步（等待完成，返回结果摘要）
  ipcMain.handle('sync:sessionSyncNow', () => {
    return getSessionSyncService().syncNow()
  })

  // 读取会话同步引擎状态
  ipcMain.handle('sync:getSessionSyncState', () => {
    return { success: true, data: getSessionSyncService().getState() }
  })

  // 渲染进程 WebSocket 收到 session_file_* 事件后转发触发（去抖在引擎内）
  ipcMain.on('sync:sessionFileEvent', () => {
    getSessionSyncService().handleSessionFileEvent()
  })

  // 手动触发配置同步（等待完成，返回结果摘要）
  ipcMain.handle('sync:configSyncNow', () => {
    return getConfigSyncService().syncNow()
  })

  // 读取配置同步引擎状态
  ipcMain.handle('sync:getConfigSyncState', () => {
    return { success: true, data: getConfigSyncService().getState() }
  })

  // 渲染进程 WebSocket 收到 manifest_updated 事件后转发触发（去抖在引擎内）
  ipcMain.on('sync:configManifestEvent', () => {
    getConfigSyncService().handleConfigManifestEvent()
  })

  // 手动触发写作同步（等待完成，返回结果摘要）
  ipcMain.handle('sync:writerSyncNow', () => {
    return getWriterSyncService().syncNow()
  })

  // 读取写作同步引擎状态
  ipcMain.handle('sync:getWriterSyncState', () => {
    return { success: true, data: getWriterSyncService().getState() }
  })

  // 渲染进程 WebSocket 收到 writer-* session_file 事件后转发触发（去抖在引擎内）
  ipcMain.on('sync:writerFileEvent', () => {
    getWriterSyncService().handleWriterFileEvent()
  })

  // 手动触发知识库同步（等待完成，返回结果摘要）
  ipcMain.handle('sync:knowledgeSyncNow', () => {
    return getKnowledgeSyncService().syncNow()
  })

  // 读取知识库同步引擎状态
  ipcMain.handle('sync:getKnowledgeSyncState', () => {
    return { success: true, data: getKnowledgeSyncService().getState() }
  })

  // 渲染进程 WebSocket 收到 knowledge-* session_file 事件后转发触发（去抖在引擎内）
  ipcMain.on('sync:knowledgeFileEvent', () => {
    getKnowledgeSyncService().handleKnowledgeFileEvent()
  })

  // 手动触发论文同步
  ipcMain.handle('sync:paperSyncNow', () => {
    return getPaperSyncService().syncNow()
  })

  // 读取论文同步引擎状态
  ipcMain.handle('sync:getPaperSyncState', () => {
    return { success: true, data: getPaperSyncService().getState() }
  })

  // 触发论文 pack 懒下载
  ipcMain.handle('sync:requestPaperPackDownload', (_event, paperId: string) => {
    getPaperSyncService().requestPaperPackDownload(paperId)
    return { success: true }
  })

  // 渲染进程 WebSocket 收到 paper-* session_file 事件后转发
  ipcMain.on('sync:paperFileEvent', () => {
    getPaperSyncService().handlePaperEvent()
  })
}
