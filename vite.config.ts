import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    watch: { ignored: ['**/data/**', '**/.tmp/**', '**/android/**', '**/dist/**'] },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/media': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
