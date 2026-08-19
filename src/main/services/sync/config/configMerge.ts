/**
 * config LWW + 本机优先合并（纯函数）。
 *
 * 规则：
 * 1. mtime 比较：local >= remote 倾向 local，否则倾向 remote；相等倾向 remote
 * 2. 机器相关条目（mcpServers/embeddingModels）本机同名条目始终保留本机版本，
 *    远端新增的同名条目并入
 * 3. 其余字段随 mtime winner 整体取用
 */
import type { AppConfig } from '@shared/types/config'

export interface MachineLocalKeys {
  mcpServerNames: Set<string>
  embeddingModelIds: Set<string>
}

export interface ConfigMergeInput {
  local: AppConfig
  localMtime: string
  remote: AppConfig
  remoteMtime: string
  machineLocalKeys: MachineLocalKeys
}

export interface ConfigMergeResult {
  merged: AppConfig
  /** local=本机更新 / remote=远端更新 / merged=双方都有改动需合并后上行 */
  winner: 'local' | 'remote' | 'merged'
  /** merged 是否与 local 不同（决定是否需落盘） */
  changed: boolean
}

/** 从本地 config 收集机器相关条目 key（本机"占有"，合并时优先） */
export function collectMachineLocalKeys(config: AppConfig): MachineLocalKeys {
  return {
    mcpServerNames: new Set(Object.keys(config.mcpServers ?? {})),
    embeddingModelIds: new Set(Object.keys(config.embeddingModels ?? {}))
  }
}

/**
 * 合并"机器相关 map 字段"：本机同名条目保留本机版本，远端新增条目并入。
 * 返回 { merged, hadConflict }：hadConflict 表示本机条目与远端不同（触发 merged）。
 */
function mergeMachineLocalMap<T>(
  localMap: Record<string, T> | undefined,
  remoteMap: Record<string, T> | undefined,
  localKeys: Set<string>
): { merged: Record<string, T>; hadConflict: boolean } {
  const result: Record<string, T> = {}
  let hadConflict = false
  // 先放远端全部
  if (remoteMap) {
    for (const [key, value] of Object.entries(remoteMap)) {
      result[key] = value
    }
  }
  // 本机占有的 key 用本机版本覆盖（本机独有、远端无的也随此并入）
  if (localMap) {
    for (const [key, localValue] of Object.entries(localMap)) {
      if (localKeys.has(key)) {
        const remoteValue = result[key]
        if (remoteValue !== undefined) {
          // 远端也有同名 → 比较，不同则记冲突
          if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
            hadConflict = true
          }
        }
        result[key] = localValue // 本机优先覆盖
      }
    }
  }
  return { merged: result, hadConflict }
}

/** 合并 config：返回合并结果与 winner */
export function mergeConfig(input: ConfigMergeInput): ConfigMergeResult {
  const { local, localMtime, remote, remoteMtime, machineLocalKeys } = input
  // 相等时 remoteWinner=true → 倾向 remote
  const remoteWinner = remoteMtime >= localMtime

  // 机器相关字段合并
  const mcpResult = mergeMachineLocalMap(
    local.mcpServers,
    remote.mcpServers,
    machineLocalKeys.mcpServerNames
  )
  const embResult = mergeMachineLocalMap(
    local.embeddingModels,
    remote.embeddingModels,
    machineLocalKeys.embeddingModelIds
  )
  const hasMachineConflict = mcpResult.hadConflict || embResult.hadConflict

  // 确定非机器相关字段来源
  const baseWinner = remoteWinner ? remote : local

  const merged: AppConfig = {
    ...baseWinner,
    mcpServers: mcpResult.merged
  } as AppConfig

  // embeddingModels 为可选字段：仅当合并结果非空或 winner 本身已有时才赋值，
  // 避免给原本没有该字段的 config 注入空对象（否则 changed 会误判为 true）
  const embMerged = embResult.merged
  if (Object.keys(embMerged).length > 0 || baseWinner.embeddingModels !== undefined) {
    merged.embeddingModels = embMerged
  }

  // winner 判定
  let winner: ConfigMergeResult['winner']
  if (hasMachineConflict) {
    // 有机器相关冲突 → 必须合并后上行
    winner = 'merged'
  } else {
    winner = remoteWinner ? 'remote' : 'local'
  }

  // changed：merged 是否与 local 不同（决定是否需落盘）
  const changed = JSON.stringify(merged) !== JSON.stringify(local)

  return { merged, winner, changed }
}
