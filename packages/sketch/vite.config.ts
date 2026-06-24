import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `vite dev` serves the demo (via ./index.html); `vite build` produces the
// library (ESM, React externalized). Type declarations are emitted separately
// by `tsc -b` into dist/types.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        react: resolve(__dirname, 'src/react/index.ts'),
        'react-canvas': resolve(__dirname, 'src/react/SketchCanvas.tsx'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
