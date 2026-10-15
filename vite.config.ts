import { defineConfig } from 'vite'

/**
 * Served from GitHub Pages at https://<owner>.github.io/ranking-visualizier/, so every asset URL
 * needs that prefix. Routing is hash based, which is why Pages needs no SPA fallback.
 * Override with VITE_BASE=/ for local previews served from the root.
 */
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/ranking-visualizier/' : '/'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Web Awesome, Lit, PouchDB and D3 together exceed the 500 kB default; one entry is fine for
    // an application this size, the budget just keeps the warning meaningful.
    chunkSizeWarningLimit: 900,
  },
  server: { strictPort: true },
}))
