/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare const __APP_VERSION__: string
