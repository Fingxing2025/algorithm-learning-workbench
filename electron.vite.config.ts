import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const coreAlias = resolve('src/core')

function rendererVendorChunk(moduleId: string): string | undefined {
  if (!moduleId.includes('node_modules')) return undefined
  if (moduleId.includes('/@codemirror/') || moduleId.includes('/@lezer/')) return 'code-editor'
  if (moduleId.includes('/highlight.js/')) return 'syntax-highlighter'
  if (moduleId.includes('/@radix-ui/')) return 'radix-ui'
  if (moduleId.includes('/motion/') || moduleId.includes('/framer-motion/')) return 'motion'
  if (moduleId.includes('/@tanstack/')) return 'tanstack'
  if (
    moduleId.includes('/react/') ||
    moduleId.includes('/react-dom/') ||
    moduleId.includes('/scheduler/')
  ) {
    return 'react-runtime'
  }
  return undefined
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
    },
    resolve: {
      alias: {
        '@core': coreAlias,
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preload scripts cannot require arbitrary node_modules at runtime.
      externalizeDeps: false,
    },
    resolve: {
      alias: {
        '@core': coreAlias,
      },
    },
  },
  renderer: {
    build: {
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: rendererVendorChunk,
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@core': coreAlias,
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
