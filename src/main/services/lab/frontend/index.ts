import { FrontendLabService } from './FrontendLabService'
import {
  frontendWorkspaceBootstrapService,
  FrontendWorkspaceBootstrapService
} from './FrontendWorkspaceBootstrapService'

const frontendLabService = new FrontendLabService()

export { frontendLabService, FrontendLabService }
export { frontendWorkspaceBootstrapService, FrontendWorkspaceBootstrapService }
export * from './imageBuilder'
export * from './waitForHttpReady'
export * from './constants'
