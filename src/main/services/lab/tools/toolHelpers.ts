import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ExecResult, FrontendFramework, LabData } from '@shared/types/lab'

interface ExecCommandToolPayload {
  command: string
  workdir?: string
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

export function buildExecCommandToolPayload(
  command: string,
  workdir: string | undefined,
  result: ExecResult
): ExecCommandToolPayload {
  return {
    command,
    workdir,
    exit_code: result.exitCode,
    duration_ms: result.duration,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

export function formatExecCommandToolResult(
  command: string,
  workdir: string | undefined,
  result: ExecResult
): MCPToolCallResult {
  return {
    success: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(buildExecCommandToolPayload(command, workdir, result), null, 2)
      }
    ]
  }
}

export function resolveProjectRootForWrite(
  lab: Pick<LabData, 'frontend'>,
  explicitProjectRoot?: string
): string | undefined {
  return explicitProjectRoot || lab.frontend?.projectRoot
}

export function selectReusableFrontendLab(
  labs: LabData[],
  name: string,
  framework: FrontendFramework
): LabData | null {
  const normalizedName = name.trim().toLowerCase()

  return (
    labs.find(
      (lab) =>
        lab.name.trim().toLowerCase() === normalizedName &&
        lab.frontend?.framework === framework &&
        lab.primaryContainerId &&
        !lab.isOrphan
    ) || null
  )
}
