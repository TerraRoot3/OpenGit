import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  base: './',  // 使用相对路径，适配 Electron
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 告诉 Vue webview 是原生自定义元素
          isCustomElement: (tag) => tag === 'webview'
        }
      }
    }),
    AutoImport({
      imports: ['vue', 'vue-router'],
      dts: true
    }),
    Components({
      dts: true
    })
  ],
  server: {
    port: 5173,
    strictPort: true,  // 端口被占用则直接报错，不用其他端口，保证 electron:dev 里 wait-on 能等到
    open: false       // 不自动打开浏览器，由 Electron 窗口加载页面
  }
})