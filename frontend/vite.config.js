import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // 关键修正：base 应该在根层级，且直接赋值字符串
  base: '/Games/', 
  
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
    // 这里删除了原本错误的 base 嵌套
  }
})