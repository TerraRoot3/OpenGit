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
