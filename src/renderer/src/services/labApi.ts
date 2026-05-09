import type {
  ComposeConfig,
  ComposeConfigMeta,
  ComposeDownOptions,
  ComposeDownResult,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeOptions,
  ComposeRestartResult,
  ComposeResult,
  ComposeStartResult,
  ComposeStatusResult,
  ComposeStopOptions,
  ComposeStopResult,
  ContainerDetailsResult,
  ContainerFilter,
  ContainerListResult,
  ContainerLogsResult,
  ContainerStatsResult,
  CreateFromDockerfileLabResult,
  CreateLabRequest,
  CreateLabResult,
  DeleteLabOptions,
  DeleteLabResult,
  DockerCheckResult,
  DockerfileConfig,
  DockerfileConfigMeta,
  ExecCommand,
  ExecCommandResult,
  DockerTerminalActionResult,
  DockerTerminalDataEvent,
  DockerTerminalExitEvent,
  DockerTerminalOpenResult,
  DockerTerminalSize,
  FrontendLabInfo,
  LabContainerStatus,
  LabData,
  LabListItem,
  LabLogEntry,
  LabResult,
  LabSelection,
  LabTemplate,
  LogOptions,
  PlatformType,
  PortMappingInput,
  SaveConfigRequest
} from '@renderer/types/lab'

function getLabApi(): Window['api']['lab'] {
  return window.api.lab
}

export const labApi = {
  checkDocker: (): Promise<DockerCheckResult> => getLabApi().checkDocker(),
  getPlatform: (): Promise<PlatformType> => getLabApi().getPlatform(),
  openExternal: (url: string): Promise<LabResult> => getLabApi().openExternal(url),

  saveLab: (data: LabData): Promise<LabResult> => getLabApi().saveLab(data),
  loadLab: (labId: string): Promise<LabData | null> => getLabApi().loadLab(labId),
  loadLabResolved: (labId: string): Promise<LabData | null> => getLabApi().loadLabResolved(labId),
  listLabs: (): Promise<LabListItem[]> => getLabApi().listLabs(),
  renameLab: (labId: string, newName: string): Promise<LabResult> =>
    getLabApi().renameLab(labId, newName),
  readLabLog: (labId: string): Promise<LabLogEntry[]> => getLabApi().readLabLog(labId),

  listContainers: (filter?: ContainerFilter): Promise<ContainerListResult> =>
    getLabApi().listContainers(filter),
  getContainerDetails: (containerId: string): Promise<ContainerDetailsResult> =>
    getLabApi().getContainerDetails(containerId),
  getContainerStats: (containerId: string): Promise<ContainerStatsResult> =>
    getLabApi().getContainerStats(containerId),
  getContainerLogs: (containerId: string, options?: LogOptions): Promise<ContainerLogsResult> =>
    getLabApi().getContainerLogs(containerId, options),

  startContainer: (containerId: string): Promise<LabResult> =>
    getLabApi().startContainer(containerId),
  stopContainer: (containerId: string, timeout?: number): Promise<LabResult> =>
    getLabApi().stopContainer(containerId, timeout),
  restartContainer: (containerId: string): Promise<LabResult> =>
    getLabApi().restartContainer(containerId),
  removeContainer: (containerId: string, force?: boolean): Promise<LabResult> =>
    getLabApi().removeContainer(containerId, force),

  execCommand: (containerId: string, command: ExecCommand): Promise<ExecCommandResult> =>
    getLabApi().execCommand(containerId, command),
  terminal: {
    open: (containerId: string, size?: DockerTerminalSize): Promise<DockerTerminalOpenResult> =>
      getLabApi().terminal.open(containerId, size),
    write: (sessionId: string, data: string): Promise<DockerTerminalActionResult> =>
      getLabApi().terminal.write(sessionId, data),
    resize: (sessionId: string, size: DockerTerminalSize): Promise<DockerTerminalActionResult> =>
      getLabApi().terminal.resize(sessionId, size),
    close: (sessionId: string): Promise<DockerTerminalActionResult> =>
      getLabApi().terminal.close(sessionId),
    onData: (callback: (event: DockerTerminalDataEvent) => void): (() => void) =>
      getLabApi().terminal.onData(callback),
    onExit: (callback: (event: DockerTerminalExitEvent) => void): (() => void) =>
      getLabApi().terminal.onExit(callback)
  },
  copyToContainer: (containerId: string, source: string, target: string): Promise<LabResult> =>
    getLabApi().copyToContainer(containerId, source, target),
  copyFromContainer: (containerId: string, source: string, target: string): Promise<LabResult> =>
    getLabApi().copyFromContainer(containerId, source, target),

  listTemplates: (): Promise<LabTemplate[]> => getLabApi().listTemplates(),
  createFromTemplate: (
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult> => getLabApi().createFromTemplate(templateId, variables),
  createFromCompose: (
    content: string,
    options?: ComposeOptions,
    labId?: string,
    labName?: string
  ): Promise<ComposeResult> => getLabApi().createFromCompose(content, options, labId, labName),
  createFromDockerfile: (
    dockerfile: string,
    context?: string,
    labId?: string,
    labName?: string,
    portMappings?: PortMappingInput[]
  ): Promise<CreateFromDockerfileLabResult> =>
    getLabApi().createFromDockerfile(dockerfile, context, labId, labName, portMappings),

  selectLab: (containerId: string, sessionId?: string): Promise<LabResult> =>
    getLabApi().selectLab(containerId, sessionId),
  deselectLab: (containerId: string): Promise<LabResult> => getLabApi().deselectLab(containerId),
  getSessionLab: (sessionId: string): Promise<LabSelection | null> =>
    getLabApi().getSessionLab(sessionId),

  dockerfile: {
    list: (): Promise<{ success: boolean; configs?: DockerfileConfigMeta[]; error?: string }> =>
      getLabApi().dockerfile.list(),
    load: (id: string): Promise<{ success: boolean; config?: DockerfileConfig; error?: string }> =>
      getLabApi().dockerfile.load(id),
    save: (
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: DockerfileConfigMeta; error?: string }> =>
      getLabApi().dockerfile.save(request),
    delete: (id: string): Promise<{ success: boolean; error?: string }> =>
      getLabApi().dockerfile.delete(id)
  },

  compose: {
    list: (): Promise<{ success: boolean; configs?: ComposeConfigMeta[]; error?: string }> =>
      getLabApi().compose.list(),
    load: (id: string): Promise<{ success: boolean; config?: ComposeConfig; error?: string }> =>
      getLabApi().compose.load(id),
    save: (
      request: SaveConfigRequest
    ): Promise<{ success: boolean; config?: ComposeConfigMeta; error?: string }> =>
      getLabApi().compose.save(request),
    delete: (id: string): Promise<{ success: boolean; error?: string }> =>
      getLabApi().compose.delete(id),
    start: (projectName: string): Promise<ComposeStartResult> =>
      getLabApi().compose.start(projectName),
    stop: (projectName: string, options?: ComposeStopOptions): Promise<ComposeStopResult> =>
      getLabApi().compose.stop(projectName, options),
    restart: (projectName: string): Promise<ComposeRestartResult> =>
      getLabApi().compose.restart(projectName),
    status: (projectName: string): Promise<ComposeStatusResult> =>
      getLabApi().compose.status(projectName),
    exec: (
      projectName: string,
      serviceName: string,
      command: string,
      options?: ComposeExecOptions
    ): Promise<ComposeExecResult> =>
      getLabApi().compose.exec(projectName, serviceName, command, options),
    logs: (projectName: string, options?: ComposeLogOptions): Promise<ComposeLogResult> =>
      getLabApi().compose.logs(projectName, options),
    downExtended: (projectName: string, options?: ComposeDownOptions): Promise<ComposeDownResult> =>
      getLabApi().compose.downExtended(projectName, options)
  },

  createLab: (request: CreateLabRequest): Promise<CreateLabResult> =>
    getLabApi().createLab(request),
  deleteLab: (labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> =>
    getLabApi().deleteLab(labId, options),
  retryFrontendInitialization: (labId: string): Promise<FrontendLabInfo> =>
    getLabApi().retryFrontendInitialization(labId),
  rebuildFrontendRuntime: (labId: string): Promise<FrontendLabInfo> =>
    getLabApi().rebuildFrontendRuntime(labId),
  validateFrontendBuild: (labId: string): Promise<FrontendLabInfo> =>
    getLabApi().validateFrontendBuild(labId),
  checkContainerStatus: (labId: string): Promise<LabContainerStatus | null> =>
    getLabApi().checkContainerStatus(labId),
  checkAllContainerStatus: (): Promise<LabContainerStatus[]> =>
    getLabApi().checkAllContainerStatus(),
  cleanupOrphan: (labId: string): Promise<LabResult> => getLabApi().cleanupOrphan(labId),
  recoverOrphan: (labId: string, newContainerId: string): Promise<LabResult> =>
    getLabApi().recoverOrphan(labId, newContainerId)
}
