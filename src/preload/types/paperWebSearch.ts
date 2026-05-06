import type { PaperWebSearchEnvironmentInfo } from '@shared/types/paper-web-search'

export type {
  PaperWebSearchRuntime,
  PaperWebSearchDependencyMode
} from '@shared/types/paper-web-search'

export type { PaperWebSearchEnvironmentInfo }

export interface PaperWebSearchApi {
  checkEnvironment: () => Promise<PaperWebSearchEnvironmentInfo>
}
