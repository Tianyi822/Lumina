import { ipcMain } from 'electron'
import { getSyncService } from '@main/services/sync'

/**
 * 注册同步相关 IPC 处理程序。
 * 通道命名 sync:method，全部返回统一 SyncResult。
 */
export function registerSyncHandlers(): void {
  // 服务发现（用于设置页验证 Relay 地址）
  ipcMain.handle('sync:discover', (_event, relayUrl: string) => {
    return getSyncService().discover(relayUrl)
  })

  // 连接（注册/登录自动分流）
  ipcMain.handle('sync:connect', (_event, relayUrl: string, username: string, password: string) => {
    return getSyncService().connect(relayUrl, username, password)
  })

  // 会话续期（无需密码）
  ipcMain.handle('sync:renewSession', () => {
    return getSyncService().renewSession()
  })

  // 获取当前同步状态
  ipcMain.handle('sync:getStatus', () => {
    return { success: true, data: getSyncService().getStatus() }
  })

  // 断开连接并清除本地身份
  ipcMain.handle('sync:disconnect', () => {
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

  // 兑换六位同步码
  ipcMain.handle('sync:redeemSyncCode', (_event, code: string) => {
    return getSyncService().redeemSyncCode(code)
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
}
