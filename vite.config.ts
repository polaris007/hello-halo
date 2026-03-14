import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Load environment variables from .env.local
 * These will be injected at build time via `define`
 */
function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(__dirname, '.env.local')
  const env: Record<string, string> = {}

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue

      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    }
  }

  return env
}

const envLocal = loadEnvLocal()

/**
 * Build-time injected analytics config
 * In open-source builds without .env.local, these will be empty strings (analytics disabled)
 */
const analyticsDefine = {
  '__HALO_GA_MEASUREMENT_ID__': JSON.stringify(envLocal.HALO_GA_MEASUREMENT_ID || ''),
  '__HALO_GA_API_SECRET__': JSON.stringify(envLocal.HALO_GA_API_SECRET || ''),
  '__HALO_BAIDU_SITE_ID__': JSON.stringify(envLocal.HALO_BAIDU_SITE_ID || ''),
}

/**
 * Build-time metadata injected into the client bundle
 */
const buildMetaDefine = {
  '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'public'),
  define: {
    ...analyticsDefine,
    ...buildMetaDefine,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
        overlay: resolve(__dirname, 'src/renderer/overlay.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        // Only proxy actual HTTP API requests, not module imports
        // Module imports should be resolved by Vite's module resolution
        bypass: (req, res, proxyOptions) => {
          const fullUrl = req.originalUrl || req.url || ''

          // Check if this looks like a module import (has file extension)
          // Module imports should NOT be proxied to the backend
          // Return the URL string so Vite's dev server serves it via module resolution
          if (fullUrl.match(/\.(ts|tsx|js|jsx|css|svg|png|jpg|jpeg|gif|woff|woff2|ico|json|wasm)(\?.*)?$/)) {
            return fullUrl
          }

          // Check if this is an API endpoint call (no file extension, looks like /api/v1/...)
          // API calls should be proxied to the backend
          if (fullUrl.startsWith('/api/v1') || fullUrl === '/api') {
            // This is an API call, proxy it
            return
          }

          // For other /api/* paths that don't match API patterns, let Vite handle them
          if (fullUrl.startsWith('/api/')) {
            console.warn(`[Vite Proxy] Unknown API path: ${fullUrl}, letting Vite handle it`)
            return fullUrl
          }
        },
      },
      '/ws': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/ready': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
