import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // The heavy renderers (Mermaid's shared core ~1.8 MB, KaTeX, Excalidraw,
    // cytoscape) are dynamically imported and only parsed when a block of that
    // type is actually used. For a desktop app served from local disk this has
    // no startup cost, so raise the warning threshold above those lazy chunks
    // rather than chasing a number that doesn't matter here.
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split always-loaded, stable vendor libs into their own chunks so
          // they cache independently of the app code (keeps the main bundle
          // smaller and rebuilds cheaper). Lazy renderers are left untouched so
          // their dynamic-import code-splitting is preserved.
          if (id.includes('node_modules')) {
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react'
            }
            if (id.includes('@tiptap') || id.includes('prosemirror')) {
              return 'vendor-editor'
            }
          }
        },
      },
    },
  },
})
