import LabDetailEmptyState from './LabDetailEmptyState'

/** SSH 实验室日志占位 Tab，提示用户通过终端查看远程日志 */
export default function LabLogsTab() {
  return (
    <LabDetailEmptyState
      title="日志功能仅限 Docker 实验室"
      message="SSH 远程服务器暂不支持此日志视图，请通过 SSH 终端查看远程日志。"
    />
  )
}
