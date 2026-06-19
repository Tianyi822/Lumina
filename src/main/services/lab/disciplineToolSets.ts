import type { LabDisciplineId } from '@shared/types/config'
import type { LabBackendType } from '@shared/types/lab'

export interface DisciplineToolSet {
  backendType: LabBackendType
  toolIds: string[]
}

export const DISCIPLINE_TOOL_SETS: Record<LabDisciplineId, DisciplineToolSet> = {
  computer: {
    backendType: 'ssh',
    toolIds: [
      'exec_command',
      'write_project_files',
      'read_file',
      'list_files',
      'delete_file',
      'pty_open',
      'pty_send',
      'pty_read',
      'pty_close',
      'ask_user'
    ]
  }
}

export function getDisciplineToolSet(discipline: LabDisciplineId): DisciplineToolSet | undefined {
  return DISCIPLINE_TOOL_SETS[discipline]
}

export function stripLabPrefix(toolName: string): string {
  return toolName.startsWith('lab__') ? toolName.slice('lab__'.length) : toolName
}
