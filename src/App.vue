<template>
  <div id="app">
    <Browser />
    <!-- 全局确认弹框 -->
    <ConfirmDialog ref="confirmDialogRef" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Browser from './components/browser/Browser.vue'
import ConfirmDialog from './components/dialog/ConfirmDialog.vue'
import { registerConfirmDialog } from './composables/useConfirm.js'

const confirmDialogRef = ref(null)

onMounted(() => {
  // 注册全局确认弹框
  registerConfirmDialog(confirmDialogRef.value)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: #2d2d30; /* 深色背景，与tab-bar一致 */
  overflow: hidden;
}

#app {
  height: 100vh;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: #2d2d30; /* 深色背景，与tab-bar一致 */
}

/* Browser 调整 */
#app {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
}
</style>