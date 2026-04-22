import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { getTerminalRouterDebugStats } from './composables/useTerminalRouter'
import {
  collectRegisteredDebugStats,
  getBrowserDebugStats,
  getProjectDetailDebugStats,
  getProjectStoreDebugStats
} from './debug/runtimeDebug.js'
import { getWorkspaceEditorDebugStats } from './components/git/workspaceEditorSession.mjs'
import './style.css'

// 在生产环境静默 console.log/debug
if (import.meta && import.meta.env && import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.log = () => {}
  // eslint-disable-next-line no-console
  console.debug = () => {}
}

// Suppress Monaco Editor's internal "Canceled" promise rejections that occur
// during model disposal (normal cleanup behavior, not an actual error)
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.name === 'Canceled') {
    event.preventDefault()
  }
})

window.__openGitDebug = {
  async getMemoryStats() {
    return {
      main: await window.electronAPI.debugMemoryStats(),
      renderer: {
        browser: getBrowserDebugStats(),
        projectDetail: getProjectDetailDebugStats(),
        projectStore: getProjectStoreDebugStats(),
        workspaceEditor: getWorkspaceEditorDebugStats(),
        terminalRouter: getTerminalRouterDebugStats(),
        providers: collectRegisteredDebugStats(),
        jsHeap: typeof performance !== 'undefined' && performance.memory
          ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          }
          : null
      }
    }
  }
}

const app = createApp(App)
app.use(router)
app.mount('#app')
