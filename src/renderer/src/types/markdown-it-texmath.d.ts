declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'
  import type { KatexOptions } from 'katex'

  interface TexmathOptions {
    engine: typeof import('katex')
    delimiters?:
      | 'dollars'
      | 'brackets'
      | 'doxygen'
      | 'gitlab'
      | 'julia'
      | 'kramdown'
      | 'beg_end'
      | Array<'dollars' | 'brackets' | 'doxygen' | 'gitlab' | 'julia' | 'kramdown' | 'beg_end'>
    katexOptions?: KatexOptions
    outerSpace?: boolean
  }

  type TexmathPlugin = (md: MarkdownIt, options?: TexmathOptions) => void

  const texmath: TexmathPlugin
  export default texmath
}
