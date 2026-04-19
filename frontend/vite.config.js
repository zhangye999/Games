import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // 双地址兼容：资源使用相对路径，支持 / 与 /Games/ 两种入口
  base: './',
  
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