<template>
  <div class="standalone-terminal">
    <TerminalPanel
      :default-cwd="''"
      :allow-first-terminal-without-cwd="true"
      :is-active="isActive"
      :snapshot-cache-key="snapshotCacheKey"
    />
  </div>
</template>

<script setup>
import TerminalPanel from './TerminalPanel.vue'

defineProps({
  isActive: { type: Boolean, default: true },
  snapshotCacheKey: { type: String, default: '__standalone__' }
})
</script>

<style scoped>
.standalone-terminal {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background: var(--theme-sem-bg-project);
}
</style>
