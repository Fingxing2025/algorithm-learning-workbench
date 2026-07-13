import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const coreAlias = resolve('src/core')

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
