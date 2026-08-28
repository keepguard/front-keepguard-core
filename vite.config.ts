import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-healthz',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/healthz') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/plain')
            res.end('healthy\n')
            return
          }
          next()
        })
      },
    },
  ],
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
