import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

// 移动端限制屏幕缩放：viewport 的 user-scalable=no 在 iOS Safari 上被无视，
// 需拦截其专属的捏合手势事件（配合 index.html 的 maximum-scale=1 与全局 touch-action）
document.addEventListener('gesturestart', (e) => e.preventDefault())

createApp(App).use(createPinia()).use(router).mount('#app')
