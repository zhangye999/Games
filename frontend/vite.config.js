import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    proxy: null,
    middlewareMode: false,
    fs: {
      strict: false,
      allow: [
        '..',
        'src',
        'node_modules'
      ]
    },
    watch: {
      usePolling: true,
      interval: 100
    },
    hmr: {
      protocol: 'ws',
      host: true,
      port: 5173,
      clientPort: 5173,
      timeout: 5000,
    }
  }
})
