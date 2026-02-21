import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

const spaFallback = () => ({
  name: 'local-spa-fallback',
  apply: 'serve',
  configureServer(server) {
    return () => {
      server.middlewares.use(async (req, res, next) => {
        const acceptHeader = req.headers.accept || ''
        const isHtmlRequest = req.method === 'GET' && acceptHeader.includes('text/html')
        const isAsset = req.url.includes('.')
        const isApi = req.url.startsWith('/api')

        if (!isHtmlRequest || isAsset || isApi) return next()

        try {
          const indexPath = resolve(server.config.root || process.cwd(), 'index.html')
          const rawHtml = readFileSync(indexPath, 'utf-8')
          const requestUrl = req.originalUrl || req.url
          const transformedHtml = await server.transformIndexHtml(requestUrl, rawHtml)
          res.setHeader('Content-Type', 'text/html')
          res.end(transformedHtml)
        } catch (err) {
          next(err)
        }
      })
    }
  }
})

export default defineConfig({
  plugins: [react(), spaFallback()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
