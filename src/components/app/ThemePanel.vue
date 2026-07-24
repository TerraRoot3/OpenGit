<template>
  <div class="theme-panel">
    <div class="theme-panel-content">
      <header class="theme-page-header">
        <h2>皮肤</h2>
        <p class="theme-intro">选择后立即应用，并同步保存到 OpenGit 配置。</p>
      </header>

      <div class="theme-grid">
        <button
          v-for="theme in themeOptions"
          :key="theme.id"
          class="theme-card"
          :class="{ active: currentTheme === theme.id }"
          type="button"
          :aria-pressed="currentTheme === theme.id"
          @click="selectTheme(theme.id)"
        >
          <span
            class="theme-preview"
            :style="{
              '--preview-bg': theme.preview.background,
              '--preview-panel': theme.preview.panel,
              '--preview-accent': theme.preview.accent,
              '--preview-text': theme.preview.text
            }"
          >
            <span class="preview-sidebar"></span>
            <span class="preview-content">
              <i></i>
              <i></i>
              <i></i>
            </span>
          </span>

          <span class="theme-meta">
            <span>
              <strong>{{ theme.label }}</strong>
              <small>{{ theme.appearanceLabel }}</small>
            </span>
            <Check v-if="currentTheme === theme.id" :size="16" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()
const currentTheme = themeStore.currentTheme

const PREVIEWS = Object.freeze({
  system: {
    background: 'linear-gradient(135deg, #172033 0 50%, #edf3fa 50% 100%)',
    panel: '#62708a',
    accent: '#5b8def',
    text: '#ffffff'
  },
  'slate-dual': {
    background: '#111827',
    panel: '#263244',
    accent: '#5d8ff3',
    text: '#e7edf7'
  },
  'graphite-moss': {
    background: '#171c19',
    panel: '#29332d',
    accent: '#7ca982',
    text: '#e4ebe5'
  },
  'abyss-blue': {
    background: '#081321',
    panel: '#122842',
    accent: '#2d8cff',
    text: '#dcecff'
  },
  'frost-slate': {
    background: '#15202b',
    panel: '#2c3b4a',
    accent: '#8eb8d8',
    text: '#ecf4f9'
  },
  'mist-paper': {
    background: '#f4f2ec',
    panel: '#dfdcd2',
    accent: '#8d7253',
    text: '#403a32'
  },
  'aurora-paper': {
    background: '#f3f7f3',
    panel: '#dbe9df',
    accent: '#3f9b72',
    text: '#263b30'
  },
  'cobalt-mist': {
    background: '#eef3f9',
    panel: '#d9e2ed',
    accent: '#376ea8',
    text: '#25384c'
  }
})

const themeOptions = computed(() => {
  const options = [{
    id: themeStore.systemTheme,
    label: '跟随系统',
    appearanceLabel: '自动切换深浅色',
    preview: PREVIEWS.system
  }]

  for (const themeId of themeStore.supportedThemes) {
    const definition = themeStore.themeDefinitions[themeId]
    options.push({
      ...definition,
      appearanceLabel: definition.appearance === 'light' ? '浅色' : '深色',
      preview: PREVIEWS[themeId]
    })
  }
  return options
})

const selectTheme = async (themeId) => {
  await themeStore.setTheme(themeId)
}
</script>

<style scoped>
.theme-panel {
  box-sizing: border-box;
  overflow: auto;
  padding: 16px;
}

.theme-panel-content {
  width: min(100%, 820px);
  margin: 0 auto;
}

.theme-page-header {
  margin-bottom: 16px;
}

.theme-page-header h2 {
  margin: 0;
  color: var(--theme-sem-text-primary);
  font-size: 20px;
  font-weight: 680;
}

.theme-intro {
  margin: 6px 0 0;
  color: var(--theme-sem-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 9px;
  padding: 8px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  background: var(--theme-sem-surface-1);
  color: var(--theme-sem-text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.theme-card:hover {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 60%, var(--theme-sem-border-default));
  transform: translateY(-1px);
}

.theme-card.active {
  border-color: var(--theme-sem-accent-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-sem-accent-primary) 34%, transparent);
}

.theme-preview {
  display: flex;
  width: 100%;
  aspect-ratio: 1.7;
  overflow: hidden;
  border-radius: 8px;
  background: var(--preview-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--preview-text) 12%, transparent);
}

.preview-sidebar {
  width: 28%;
  background: color-mix(in srgb, var(--preview-panel) 88%, transparent);
}

.preview-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  padding: 12px 10px;
}

.preview-content i {
  display: block;
  height: 5px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--preview-text) 54%, transparent);
}

.preview-content i:first-child {
  width: 56%;
  background: var(--preview-accent);
}

.preview-content i:nth-child(2) {
  width: 84%;
}

.preview-content i:nth-child(3) {
  width: 70%;
}

.theme-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px 2px;
}

.theme-meta > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.theme-meta strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-meta small {
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.theme-meta svg {
  flex: 0 0 auto;
  color: var(--theme-sem-accent-primary);
}
</style>
