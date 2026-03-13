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
      '/api/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ready': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
