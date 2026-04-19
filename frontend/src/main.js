import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 引入你在 router/index.js 中定义的路由

const app = createApp(App)

app.use(router) // 使用路由
app.mount('#app') // 挂载应用
