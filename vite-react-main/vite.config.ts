import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gate: resolve(__dirname, 'gate.html'),
        success: resolve(__dirname, 'success.html'),
        osakaTourViewer: resolve(__dirname, 'osaka-tour-viewer.html'),
      },
    },
  },
})
