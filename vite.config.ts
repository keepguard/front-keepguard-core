import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const healthProxy = (target: string, rewriteTo: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: () => rewriteTo,
})

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-healthz',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/healthz' || req.url === '/connections-health/front') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: 'UP' }))
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
      '/connections-health/bff-auth': healthProxy('http://localhost:8381', '/health'),
      '/connections-health/bff-core': healthProxy('http://localhost:8382', '/health'),
      '/connections-health/ms-auth': healthProxy('http://localhost:8081', '/actuator/health'),
      '/connections-health/ms-communication': healthProxy('http://localhost:8082', '/actuator/health'),
      '/connections-health/ms-company': healthProxy('http://localhost:8083', '/actuator/health'),
      '/connections-health/ms-user': healthProxy('http://localhost:8085', '/actuator/health'),
      '/connections-health/ms-user-consents': healthProxy('http://localhost:8086', '/actuator/health'),
      '/connections-health/srv-email-sender': healthProxy('http://localhost:8601', '/health'),
      '/connections-health/srv-token-manager': healthProxy('http://localhost:8700', '/health'),
      '/connections-health/srv-sms-sender': healthProxy('http://localhost:8610', '/health'),
      '/connections-health/mock-sms-gateway': healthProxy('http://localhost:8089', '/health'),
      '/connections-health/minio': healthProxy('http://localhost:9000', '/minio/health/live'),
      '/connections-health/rabbitmq': healthProxy('http://localhost:15672', '/api/health/checks/alarms'),
      '/connections-health/prometheus': healthProxy('http://localhost:9095', '/-/healthy'),
      '/connections-health/grafana': healthProxy('http://localhost:3001', '/api/health'),
    },
  },
})
