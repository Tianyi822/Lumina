/**
 * 沙箱管理工具集合
 *
 * 此文件作为管理工具的统一导出入口，将各工具模块组合在一起。
 *
 * 模块结构：
 * - createSandbox.ts: 创建沙箱工具
 * - lifecycleTools.ts: 生命周期管理工具（启动、停止、重启、删除）
 * - utils/: 辅助函数
 *   - dockerParser.ts: Docker 配置文件解析
 *   - portAllocation.ts: 端口分配
 *   - imageCheck.ts: 镜像检查
 */

// 导出创建沙箱工具
export { createSandboxTool, recoverFrontendSandboxRuntimeIfNeeded } from './createSandbox'

// 导出生命周期管理工具
export {
  startSandboxTool,
  stopSandboxTool,
  restartSandboxTool,
  deleteSandboxTool,
  lifecycleTools
} from './lifecycleTools'

// 从各模块导入工具以组成完整的管理工具集合
import { createSandboxTool } from './createSandbox'
import { lifecycleTools } from './lifecycleTools'

/**
 * 所有沙箱管理工具的集合
 * 包含：创建、启动、停止、重启、删除
 */
export const managementTools = [createSandboxTool, ...lifecycleTools]
