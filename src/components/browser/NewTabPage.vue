<template>
  <div
    class="new-tab-page"
    :class="[`route-${routeType}`, { 'is-active': isActive }]"
    :style="{ display: displayStyle }"
  >
    <!-- 新标签页（空白页）显示首页内容 -->
    <HomePage 
      v-if="routeType === 'new-tab'"
      :is-new-tab="true"
      @navigate="handleNavigate" 
      @navigate-current="handleNavigateCurrent"
    />
    
    <!-- WebView 网页 -->
    <WebView
      v-else-if="routeType === 'webview' && contentHost !== 'webcontentsview'"
      :tab-id="tabId"
      :src="src"
      :partition="routeProps?.sessionPartition || 'persist:main'"
      :user-agent="userAgent"
      :is-active="isActive"
      @did-start-loading="(e, id) => emit('did-start-loading', e, id)"
      @did-stop-loading="(e, id) => emit('did-stop-loading', e, id)"
      @did-navigate="(e, id) => emit('did-navigate', e, id)"
      @did-navigate-in-page="(e, id) => emit('did-navigate-in-page', e, id)"
      @new-window="(e, id) => emit('new-window', e, id)"
      @dom-ready="(e, id) => emit('dom-ready', e, id)"
      @did-fail-load="(e, id) => emit('did-fail-load', e, id)"
      @webview-ready="(webview, id) => emit('webview-ready', webview, id)"
      @navigation-state-changed="(state, id) => emit('navigation-state-changed', state, id)"
      @title-updated="(title, id) => emit('title-updated', title, id)"
      @favicon-updated="(favicon, id) => emit('favicon-updated', favicon, id)"
    />

    <div v-else-if="routeType === 'webview'" class="webcontentsview-placeholder"></div>
    
    <!-- 收藏管理 -->
    <FavoritesManager 
      v-else-if="routeType === 'favorites-manager'"
      @navigate="handleNavigate" 
    />
    
    <!-- 密码管理 -->
    <PasswordManager 
      v-else-if="routeType === 'password-manager'"
      @open-site="handleNavigate" 
    />
    
    <!-- 远端仓库 -->
    <RemoteRepo
      v-else-if="routeType === 'remote-repo'"
    />
    
    <!-- 目录入口兼容：直接按项目详情打开 -->
    <ProjectDetail 
      v-else-if="routeType === 'clone-directory'"
      :path="routeProps?.path"
      allow-directory-mode
      :is-active="isActive"
      @branch-changed="(payload) => emit('project-branch-changed', payload)"
      @status-updated="(payload) => emit('project-status-updated', payload)"
      @pending-status-changed="(payload) => emit('project-pending-status-changed', payload)"
    />
    
    <!-- 单个 Git 仓库 -->
    <ProjectDetail 
      v-else-if="routeType === 'single-project'"
      :path="routeProps?.path"
      :is-active="isActive"
      @branch-changed="(payload) => emit('project-branch-changed', payload)"
      @status-updated="(payload) => emit('project-status-updated', payload)"
      @pending-status-changed="(payload) => emit('project-pending-status-changed', payload)"
    />
    
    <!-- 历史记录 -->
    <HistoryManager 
      v-else-if="routeType === 'browsing-history'"
      @navigate="handleNavigate"
    />
    
    <!-- 备份管理 -->
    <BackupManager 
      v-else-if="routeType === 'backup-manager'"
    />
    
    <!-- 扩展管理 -->
    <ExtensionManager
      v-else-if="routeType === 'extension-manager'"
    />

    <!-- 独立终端 -->
    <StandaloneTerminal
      v-else-if="routeType === 'standalone-terminal'"
      :is-active="isActive"
    />

    <FocusTerminalStack
      v-else-if="routeType === 'standalone-terminal-focus'"
      :is-active="isActive"
    />

    <StandaloneSplitTerminal
      v-else-if="routeType === 'standalone-terminal-split'"
      :is-active="isActive"
    />

  </div>
</template>

<script setup>
import { computed } from 'vue'
import HomePage from '../HomePage.vue'
import WebView from '../webview/WebView.vue'
import FavoritesManager from './FavoritesManager.vue'
import PasswordManager from './PasswordManager.vue'
import RemoteRepo from '../git/RemoteRepo.vue'
import ProjectDetail from '../git/ProjectDetail.vue'
import HistoryManager from './HistoryManager.vue'
import BackupManager from '../BackupManager.vue'
import ExtensionManager from '../ExtensionManager.vue'
import StandaloneTerminal from '../terminal/StandaloneTerminal.vue'
import FocusTerminalStack from '../terminal/FocusTerminalStack.vue'
import StandaloneSplitTerminal from '../terminal/StandaloneSplitTerminal.vue'

const props = defineProps({
  tabId: {
    type: [Number, String],
    required: true
  },
  routeType: {
    type: String,
    default: 'new-tab'
  },
  routeProps: {
    type: Object,
    default: () => ({})
  },
  // WebView 相关 props
  src: {
    type: String,
    default: ''
  },
  contentHost: {
    type: String,
    default: 'webcontentsview'
  },
  userAgent: {
    type: String,
    default: ''
  },
  favoriteProjectPaths: {
    type: Array,
    default: () => []
  },
  isActive: {
    type: Boolean,
    default: false
  }
})

// 自己控制自己的显示/隐藏
const displayStyle = computed(() => props.isActive ? 'flex' : 'none')

const emit = defineEmits([
  'navigate', 
  'navigate-current',
  // WebView 事件
  'did-start-loading',
  'did-stop-loading',
  'did-navigate',
  'did-navigate-in-page',
  'new-window',
  'dom-ready',
  'did-fail-load',
  'webview-ready',
  'navigation-state-changed',
  'title-updated',
  'favicon-updated',
  'project-branch-changed',
  'project-status-updated',
  'project-pending-status-changed',
  'toggle-project-favorite'
])

// 在新标签打开
const handleNavigate = (url) => {
  console.log('🆕 NewTabPage 新标签导航:', url)
  emit('navigate', url)
}

// 在当前标签打开（新标签页点击收藏时，在当前标签加载）
const handleNavigateCurrent = (url) => {
  console.log('🆕 NewTabPage 当前标签导航:', url)
  emit('navigate-current', url)
}
</script>

<style scoped>
.new-tab-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  flex-direction: column;
  /* display 由 computed style 控制 */
}

.new-tab-page.route-single-project {
  background: var(--theme-sem-bg-project);
}

.new-tab-page.is-active {
  z-index: 1;
}

.webcontentsview-placeholder {
  width: 100%;
  height: 100%;
}
</style>
