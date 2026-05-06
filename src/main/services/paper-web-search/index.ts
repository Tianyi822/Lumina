import { PaperWebSearchService } from './PaperWebSearchService'
import { PaperWebSearchToolAdapter } from './PaperWebSearchToolAdapter'

export const paperWebSearchService = new PaperWebSearchService()
export const paperWebSearchToolAdapter = new PaperWebSearchToolAdapter(paperWebSearchService)
export { PaperWebSearchService, PaperWebSearchToolAdapter }
