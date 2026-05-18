import { createContext, useContext } from 'react'
import type { PaperQuote } from '@shared/types/chat'

interface PaperQuoteContextValue {
  scrollToQuote: ((quote: PaperQuote) => void) | null
}

export const PaperQuoteContext = createContext<PaperQuoteContextValue>({
  scrollToQuote: null
})

export function usePaperQuoteContext(): PaperQuoteContextValue {
  return useContext(PaperQuoteContext)
}
