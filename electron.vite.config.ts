import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  main: {
    // @noble 三包为 ESM-only，需打包进 CJS 主进程产物；其余依赖仍按默认规则外部化
    plugins: [
      externalizeDepsPlugin({ exclude: ['@noble/hashes', '@noble/ciphers', '@noble/curves'] })
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({ exclude: ['@noble/hashes', '@noble/ciphers', '@noble/curves'] })
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime'
      ]
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    }
  }
})
