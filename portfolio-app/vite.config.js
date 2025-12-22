import { defineConfig } from 'vite'

// Allow overriding base for GH Pages subpath deployments
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
