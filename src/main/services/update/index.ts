import { UpdateService } from './UpdateService'
import { ReleaseNotesService } from './ReleaseNotesService'

export const updateService = new UpdateService()

const REPO_SPEC = 'Tianyi822/Lumina'
const [owner, repo] = REPO_SPEC.split('/')

export const releaseNotesService = new ReleaseNotesService(owner, repo)
