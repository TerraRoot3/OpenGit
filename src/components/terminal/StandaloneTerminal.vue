<template>
  <div class="standalone-terminal">
    <TerminalPanel
      :default-cwd="''"
      :allow-first-terminal-without-cwd="true"
      :is-active="isActive"
    />
  </div>
</template>

<script setup>
import TerminalPanel from './TerminalPanel.vue'

defineProps({
  isActive: { type: Boolean, default: true }
})
</script>

<style scoped>
.standalone-terminal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}
</style>
