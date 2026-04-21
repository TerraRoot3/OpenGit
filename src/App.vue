<template>
  <div id="app">
    <AppShell />
    <!-- 全局确认弹框 -->
    <ConfirmDialog ref="confirmDialogRef" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppShell from './components/app/AppShell.vue'
import ConfirmDialog from './components/dialog/ConfirmDialog.vue'
import { registerConfirmDialog } from './composables/useConfirm.js'
import { useThemeStore } from './stores/themeStore.js'

const confirmDialogRef = ref(null)
const themeStore = useThemeStore()

onMounted(() => {
  // 注册全局确认弹框
  registerConfirmDialog(confirmDialogRef.value)
  // 初始化全局主题（后续支持设置页切换）
  themeStore.hydrate()
})
</script>

<style>
:root {
  color-scheme: dark;
  --app-shell-bg: #14171c;
  --app-sidebar-bg: #2a2e34;
  --app-sidebar-bg-soft: #31363d;
  --app-workspace-bg: #14171c;
  --app-project-bg: #161b22;
  --app-surface-1: #1d2127;
  --app-surface-2: #242931;
  --app-border: transparent;
  --app-border-strong: transparent;
  --app-text-primary: rgba(255, 255, 255, 0.92);
  --app-text-secondary: rgba(255, 255, 255, 0.72);
  --app-text-muted: rgba(255, 255, 255, 0.52);
  --app-hover: rgba(255, 255, 255, 0.08);
  --app-selected-bg: var(--app-sidebar-bg-soft);
  --app-selected-border: transparent;
  --app-selected-radius: 10px;
  --app-sidebar-selected-bg: color-mix(in srgb, var(--app-sidebar-bg-soft) 82%, #5d7290 18%);
  --app-sidebar-selected-border: transparent;
  --app-tab-selected-bg: #364153;
  --app-tab-selected-border: transparent;
  --app-tab-selected-accent: #8eb9ff;
  --app-primary: #4f8cff;
  --app-primary-strong: #57d3ff;
  --app-info: #93c5fd;
  --app-info-bg: rgba(59, 130, 246, 0.2);
  --app-info-border: rgba(59, 130, 246, 0.34);
  --app-warning: #f4d37d;
  --app-warning-bg: rgba(217, 155, 32, 0.2);
  --app-warning-border: rgba(217, 155, 32, 0.32);
  --app-success: #86efac;
  --app-success-bg: rgba(34, 197, 94, 0.2);
  --app-danger: #fca5a5;
  --app-danger-bg: rgba(220, 80, 80, 0.24);
  --app-overlay: rgba(0, 0, 0, 0.56);
  --app-dialog-bg: #2a2e35;
  --app-menu-bg: #2a2e35;
  --app-tooltip-bg: rgba(25, 28, 33, 0.98);
}

html[data-theme='slate-dual'] {
  --app-shell-bg: #14171c;
  --app-sidebar-bg: #2a2e34;
  --app-sidebar-bg-soft: #31363d;
  --app-workspace-bg: #14171c;
  --app-project-bg: #161b22;
  --app-surface-1: #1d2127;
  --app-surface-2: #242931;
  --app-border: transparent;
  --app-border-strong: transparent;
  --app-text-primary: rgba(255, 255, 255, 0.92);
  --app-text-secondary: rgba(255, 255, 255, 0.72);
  --app-text-muted: rgba(255, 255, 255, 0.52);
  --app-hover: rgba(255, 255, 255, 0.08);
  --app-selected-bg: var(--app-sidebar-bg-soft);
  --app-selected-border: transparent;
  --app-selected-radius: 10px;
  --app-sidebar-selected-bg: color-mix(in srgb, var(--app-sidebar-bg-soft) 82%, #5d7290 18%);
  --app-sidebar-selected-border: transparent;
  --app-tab-selected-bg: #364153;
  --app-tab-selected-border: transparent;
  --app-tab-selected-accent: #8eb9ff;
  --app-primary: #4f8cff;
  --app-primary-strong: #57d3ff;
  --app-info: #93c5fd;
  --app-info-bg: rgba(59, 130, 246, 0.2);
  --app-info-border: rgba(59, 130, 246, 0.34);
  --app-warning: #f4d37d;
  --app-warning-bg: rgba(217, 155, 32, 0.2);
  --app-warning-border: rgba(217, 155, 32, 0.32);
  --app-success: #86efac;
  --app-success-bg: rgba(34, 197, 94, 0.2);
  --app-danger: #fca5a5;
  --app-danger-bg: rgba(220, 80, 80, 0.24);
  --app-overlay: rgba(0, 0, 0, 0.56);
  --app-dialog-bg: #2a2e35;
  --app-menu-bg: #2a2e35;
  --app-tooltip-bg: rgba(25, 28, 33, 0.98);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--app-shell-bg);
  overflow: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--app-border-strong) transparent;
}

*::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: var(--app-border-strong);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--app-border-strong);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}

#app {
  height: 100vh;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: var(--app-shell-bg);
}

/* Browser 调整 */
#app {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
}
</style>
