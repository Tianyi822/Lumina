import type {
  CreateLabRequest,
  CreateLabResult,
  DeleteLabOptions,
  DeleteLabResult,
  LabData,
  LabListItem,
  LabLogEntry,
  LabResult,
  PlatformType
} from '@renderer/types/lab'

function getLabApi(): Window['api']['lab'] {
  return window.api.lab
}

export const labApi = {
  getPlatform: (): Promise<PlatformType> => getLabApi().getPlatform(),
  openExternal: (url: string): Promise<LabResult> => getLabApi().openExternal(url),

  saveLab: (data: LabData): Promise<LabResult> => getLabApi().saveLab(data),
  loadLab: (labId: string): Promise<LabData | null> => getLabApi().loadLab(labId),
  listLabs: (): Promise<LabListItem[]> => getLabApi().listLabs(),
  renameLab: (labId: string, newName: string): Promise<LabResult> =>
    getLabApi().renameLab(labId, newName),
  readLabLog: (labId: string): Promise<LabLogEntry[]> => getLabApi().readLabLog(labId),

  createLab: (request: CreateLabRequest): Promise<CreateLabResult> =>
    getLabApi().createLab(request),
  deleteLab: (labId: string, options?: DeleteLabOptions): Promise<DeleteLabResult> =>
    getLabApi().deleteLab(labId, options)
}
