import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/bff-auth-proxy': {
        target: 'http://localhost:8381',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bff-auth-proxy/, ''),
      },
      '/bff-core-proxy': {
        target: 'http://localhost:8382',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bff-core-proxy/, ''),
      },
    },
  },
})

