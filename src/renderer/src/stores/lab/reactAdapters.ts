/**
 * Pinia labStore → React 类型安全适配器
 *
 * 在 labStores 完成 Pinia→Zustand 转换前，提供类型安全的 React hook。
 * 后续转换为 Zustand 后，只需替换此文件的实现即可。
 */

import { usePiniaStore } from '@renderer/composables/usePiniaStore'
import { useLabStore, useContainerStore, useLabCreatorStore } from './index'
import type { LabData, LabCreationType, ContainerDetails, ContainerStats, ContainerInfo, TerminalLog } from '@renderer/types/lab'
import type { DeleteLabOptions } from '@shared/types/lab'
import type { PortMapping } from './types'

// ==================== Lab Store ====================

export interface DeleteConfirmState {
  show: boolean
  isDeleting: boolean
  labId: string
  labName: string
  containerCount: number
  hasWorkspace: boolean
  workspaceName: string
  creationType: LabCreationType
  isOrphan: boolean
}

export interface LabStoreReact {
  currentLab: LabData | null
  currentLabId: string | null
  labList: LabData[]
  isLoading: boolean
  deleteConfirmState: DeleteConfirmState
  loadLabList: () => Promise<void>
  loadLab: (labId: string, refresh?: boolean, opts?: { silent?: boolean }) => Promise<void>
  handleSelectLab: (labId: string) => Promise<void>
  handleDeleteLab: (labId: string) => Promise<void>
  hideDeleteConfirm: () => void
  confirmDelete: (options: DeleteLabOptions) => Promise<void>
  connectSsh: (labId: string, config: {
    host: string; port: number; username: string; authType: string
    password?: string; keyName?: string
  }) => Promise<boolean>
  retryFrontendInitialization: (labId: string) => Promise<boolean>
  rebuildFrontendRuntime: (labId: string) => Promise<boolean>
}

export function useLabStoreReact(): LabStoreReact {
  return usePiniaStore(useLabStore) as unknown as LabStoreReact
}

// ==================== Container Store ====================

export interface ContainerStoreReact {
  containers: ContainerInfo[]
  selectedContainer: ContainerDetails | null
  containerStats: ContainerStats | null
  isLoading: boolean
  terminalLogs: TerminalLog[]
  loadContainers: () => Promise<void>
  loadContainerDetails: (containerId: string) => Promise<ContainerDetails | null>
  loadContainerStats: (containerId: string) => Promise<void>
  startContainer: (containerId: string) => Promise<boolean>
  stopContainer: (containerId: string) => Promise<boolean>
  restartContainer: (containerId: string) => Promise<boolean>
}

export function useContainerStoreReact(): ContainerStoreReact {
  return usePiniaStore(useContainerStore) as unknown as ContainerStoreReact
}

// ==================== Creator Store ====================

export interface CreatorStoreReact {
  createType: LabCreationType
  selectedContainerId: string | null
  composeContent: string
  composeProjectName: string
  dockerfileContent: string
  dockerfileContext: string
  dockerfileProjectName: string
  portMappings: PortMapping[]
  sshConfig: {
    host: string; port: number; username: string; authType: 'password' | 'key'
    password: string; keyContent: string; keyName: string
  }
  showSaveDialog: boolean
  saveDialogType: 'dockerfile' | 'compose'
  saveConfigName: string
  isCreating: boolean
  createError: string | null
  createPhase: string
  createPhaseText: string
  createProgress: number
  canCreate: boolean
  containerSelectHint: string
  resetSshConfig: () => void
  updateSshConfig: (partial: Partial<CreatorStoreReact['sshConfig']>) => void
  openSaveDialog: (type: 'dockerfile' | 'compose') => void
  closeSaveDialog: () => void
  handleSaveConfig: () => Promise<void>
  handleCreate: () => Promise<void>
  clearError: () => void
  refreshPorts: () => void
  addPortMapping: () => void
  updatePortMapping: (index: number, patch: Record<string, unknown>) => void
  removePortMapping: (index: number) => void
  getComposeTemplate: (type: string) => string
}

export function useLabCreatorStoreReact(): CreatorStoreReact {
  return usePiniaStore(useLabCreatorStore) as unknown as CreatorStoreReact
}
