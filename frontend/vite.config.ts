import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 29000,
    allowedHosts: ['cloudops.rebepi.com'],
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:27902' },
  },
})
