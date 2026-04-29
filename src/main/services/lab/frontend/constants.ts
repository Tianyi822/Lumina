export const DEFAULT_FRONTEND_PORT = 5173
export const FRONTEND_HOST_PORT_BASE = 30000
export const FRONTEND_INSTALL_TIMEOUT_SECONDS = 600
export const PREVIEW_READY_TIMEOUT_MS = 15000

export const FRONTEND_STORAGE_TYPE = 'docker-volume' as const
export const FRONTEND_MOUNT_PATH = '/workspace' as const
export const FRONTEND_PACKAGE_MANAGER = 'bun' as const
export const FRONTEND_RUNTIME = 'bun' as const
export const FRONTEND_BUILDER = 'bun' as const

export const FRONTEND_BOOTSTRAP_DIR = '.lab'
export const FRONTEND_BOOTSTRAP_STATE_FILE = `${FRONTEND_BOOTSTRAP_DIR}/bootstrap.json`

export const FRONTEND_STARTUP_LOG_PATH = '/tmp/frontend-dev.log'
export const FRONTEND_LOG_HINT = `可稍后重试，或通过 lab__exec_command 查看 ${FRONTEND_STARTUP_LOG_PATH}`
