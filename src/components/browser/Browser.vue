<template>
  <div class="browser-container">
    <!-- Tooltip -->
    <div 
      v-if="tooltipVisible && tooltipText"
      class="browser-tab-tooltip"
      :style="tooltipStyle"
    >
      {{ tooltipText }}
    </div>
    
    <!-- 浏览器标签页栏 -->
    <div 
      class="browser-tabs-bar"
      @mouseleave="onTabsBarMouseLeave"
    >
      <!-- 系统菜单预留空间 -->
      <div class="system-menu-space" :style="{ width: `${leadingWindowControlsSpace}px` }"></div>
      <div class="browser-tabs-list">
        <div
          v-for="(tab, index) in browserTabs"
          :key="tab.id"
          :data-tab-id="tab.id"
          class="browser-tab-item"
          :class="{ 
            active: activeBrowserTabId === tab.id,
            'leading-tab': isLeadingTab(tab.id),
            'drag-over': dragOverTabId === tab.id,
            'dragging': draggingTabId === tab.id,
            'hide-separator': shouldHideSeparator(tab.id)
          }"
          :style="{ order: getTabOrder(tab.id) }"
          @click="switchBrowserTab(tab.id)"
          @mouseenter="(e) => showTooltip(e, tab.title || tab.url || '新标签页')"
          @mouseleave="hideTooltip"
          @mousedown="(e) => onTabMouseDown(e, tab, index)"
        >
          <!-- 页面图标 -->
          <div class="browser-tab-icon">
            <!-- 优先显示已有的 Favicon -->
            <img 
              v-if="tab.favicon && !tab.faviconError" 
              :src="tab.favicon" 
              :alt="tab.title || '标签页'"
              @error="tab.faviconError = true"
              class="tab-favicon"
            />
            <!-- Loading 状态（只在没有 favicon 时显示） -->
            <div v-else-if="tab.isLoading && tab.routeType === 'webview'" class="tab-loading">
              <Loader :size="12" class="loading-spinner" />
            </div>
            <!-- Git 目录刷新时显示 loading -->
            <div v-else-if="tab.isRefreshing && (tab.routeType === 'clone-directory' || tab.routeType === 'single-project' || tab.routeType === 'remote-repo')" class="tab-loading">
              <Loader :size="12" class="loading-spinner" />
            </div>
            <!-- 默认图标 -->
            <FileText v-else-if="tab.routeType === 'new-tab' || tab.routeType === 'browser-tab'" :size="14" />
            <Bookmark v-else-if="tab.routeType === 'favorites-manager'" :size="14" />
            <Key v-else-if="tab.routeType === 'password-manager'" :size="14" />
            <Cloud v-else-if="tab.routeType === 'remote-repo'" :size="14" />
            <Folder v-else-if="tab.routeType === 'clone-directory'" :size="14" />
            <GitBranch v-else-if="tab.routeType === 'single-project'" :size="14" />
            <History v-else-if="tab.routeType === 'browsing-history'" :size="14" />
            <HardDrive v-else-if="tab.routeType === 'backup-manager'" :size="14" />
            <Puzzle v-else-if="tab.routeType === 'extension-manager'" :size="14" />
            <Terminal v-else-if="tab.routeType === 'standalone-terminal' || tab.routeType === 'standalone-terminal-focus' || tab.routeType === 'standalone-terminal-split'" :size="14" />
            <Globe v-else :size="14" />
          </div>
          <span class="browser-tab-title">{{ tab.isLoading && !tab.title ? '加载中...' : (tab.title || '新标签页') }}</span>
          <button
            class="browser-tab-close"
            @click.stop="closeBrowserTab(tab.id)"
            @mouseenter="(e) => showTooltip(e, '关闭标签页')"
            @mouseleave="hideTooltip"
          >
            <X :size="12" />
          </button>
        </div>
        <!-- 新建标签按钮始终在最后 -->
        <button
          class="browser-tab-new"
          :style="{ order: 99999 }"
          @click="createNewBrowserTab"
          title="新建标签页"
        >
          <X :size="16" :style="{ transform: 'rotate(45deg)' }" />
        </button>
      </div>
      <!-- 标签栏右侧拖拽区域 -->
      <div class="tabs-bar-drag-area"></div>
      <div class="tabs-bar-menu-wrapper" @click.stop>
        <button
          class="toolbar-btn tabs-bar-menu-btn"
          @click="toggleMenu"
          title="更多选项"
        >
          <MoreVertical :size="18" />
        </button>
        <Teleport to="body">
          <div
            v-if="showMenu"
            class="toolbar-menu-overlay"
            @click="showMenu = false"
          ></div>
          <div v-if="showMenu" class="toolbar-menu" :style="{ top: menuPosition.top + 'px', right: menuPosition.right + 'px' }">
            <div class="menu-item" @click="openRemoteRepo">
              <Cloud :size="16" />
              <span>远端仓库</span>
            </div>
            <div class="menu-item" @click="openFavoritesManager">
              <Bookmark :size="16" />
              <span>收藏管理</span>
            </div>
            <div class="menu-item" @click="openBrowsingHistory">
              <History :size="16" />
              <span>历史记录</span>
            </div>
            <div class="menu-item" @click="openPasswordManager">
              <Key :size="16" />
              <span>密码管理</span>
            </div>
            <div class="menu-item" @click="openDownloadPanel">
              <Download :size="16" />
              <span>下载管理</span>
            </div>
            <div class="menu-item" @click="openStandaloneTerminal">
              <Terminal :size="16" />
              <span>灵动终端</span>
            </div>
            <div class="menu-item" @click="openStandaloneSplitTerminal">
              <Terminal :size="16" />
              <span>分屏终端</span>
            </div>
            <div class="menu-item" @click="createNewPrivateBrowserTab">
              <Globe :size="16" />
              <span>新建隐私标签页</span>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" @click="openBackupManager">
              <HardDrive :size="16" />
              <span>备份管理</span>
            </div>
            <!-- 扩展管理暂时隐藏，Electron 对 Chrome 扩展支持有限 -->
            <!-- <div class="menu-item" @click="openExtensionManager">
              <Puzzle :size="16" />
              <span>扩展管理</span>
            </div> -->
          </div>
        </Teleport>
      </div>
    </div>

    <!-- 浏览器工具栏 -->
    <div v-if="showBrowserToolbar" class="browser-toolbar">
      <div class="toolbar-left">
        <button 
          class="toolbar-btn" 
          @click="goBack" 
          :disabled="!canGoBack"
          title="返回"
        >
          <ArrowLeft :size="18" />
        </button>
        <button 
          class="toolbar-btn" 
          @click="goForward" 
          :disabled="!canGoForward"
          title="前进"
        >
          <ArrowRight :size="18" />
        </button>
        <button 
          class="toolbar-btn" 
          @click="refresh" 
          title="刷新"
        >
          <RefreshCw :size="18" />
        </button>
        <button 
          class="toolbar-btn" 
          @click="goHome" 
          title="首页"
        >
          <HomeIcon :size="18" />
        </button>
      </div>
      
      <div class="toolbar-center">
          <div class="url-input-wrapper">
          <input 
          ref="urlInputRef"
          v-model="urlInput" 
          @input="onUrlInputChange"
          @keydown="onUrlInputKeydown"
          @blur="onUrlInputBlur"
          @focus="onUrlInputFocus"
          class="url-input"
          placeholder="输入网址或搜索..."
          type="text"
          autocomplete="off"
        />
        <!-- 联想提示：Electron 下走主进程浮层（与右上角菜单一致），避免被 WebContentsView 盖住 -->
        <div v-if="showSuggestions && allSuggestions.length > 0 && !useNativeUrlSuggestions" class="about-suggestions">
          <div 
            v-for="(item, index) in allSuggestions" 
            :key="item.id || item.url"
            class="suggestion-item"
            :class="{ active: suggestionIndex === index }"
            @mousedown.prevent="selectSuggestion(item)"
            @mouseenter="suggestionIndex = index"
          >
            <img v-if="item.favicon" :src="item.favicon" class="suggestion-favicon" @error="item.favicon = ''" />
            <component v-else :is="item.icon || Globe" :size="14" class="suggestion-icon" />
            <span class="suggestion-url">{{ item.displayUrl || item.url }}</span>
            <span class="suggestion-title">{{ item.title }}</span>
          </div>
        </div>
        <div class="url-input-actions">
          <button
            class="url-input-favorite-btn"
            @click="toggleFavorite"
            :class="{ active: isCurrentUrlFavorited, disabled: !canFavorite }"
            :disabled="!canFavorite"
            :title="!canFavorite ? '此页面不支持收藏' : (isCurrentUrlFavorited ? '取消收藏' : '收藏')"
          >
            <Star :size="16" :fill="isCurrentUrlFavorited ? 'currentColor' : 'none'" />
          </button>
          <button
            class="url-input-favorite-btn"
            @click="openSitePermissionPanel"
            :class="{ disabled: !currentTab || currentTab.routeType !== 'webview' }"
            :disabled="!currentTab || currentTab.routeType !== 'webview'"
            :title="(!currentTab || currentTab.routeType !== 'webview') ? '仅网页标签可用' : '站点信息与权限'"
          >
            <Globe :size="16" />
          </button>
          <button
            class="url-input-favorite-btn"
            @click="toggleWebAuthnDiagnostics"
            :class="{ disabled: !currentTab || currentTab.routeType !== 'webview' }"
            :disabled="!currentTab || currentTab.routeType !== 'webview'"
            :title="(!currentTab || currentTab.routeType !== 'webview') ? '仅网页标签可用' : 'WebAuthn 诊断'"
          >
            <Key :size="16" />
          </button>
        </div>
          </div>
      </div>
    </div>
    <div v-if="showBrowserToolbar && loadingProgressVisible" class="loading-progress-track">
      <div class="loading-progress-bar" :style="{ width: `${loadingProgress}%` }"></div>
    </div>
                    
    <!-- 主内容区域 -->
    <div ref="browserContentRef" class="browser-content">
      <div
        v-if="activeTabCrashed"
        class="browser-error-banner"
        :class="{ 'with-permission-banner': hasPermissionPrompt && currentPermissionPrompt }"
      >
        <div class="error-main">
          <span class="error-title">标签页渲染进程异常</span>
          <span class="error-detail">当前网页进程已退出，可尝试恢复标签页</span>
        </div>
        <button class="error-retry-btn" @click="restoreActiveWebTab">恢复标签页</button>
      </div>
      <div
        v-else-if="activeTabLoadError"
        class="browser-error-banner"
        :class="{ 'with-permission-banner': hasPermissionPrompt && currentPermissionPrompt }"
      >
        <div class="error-main">
          <span class="error-title">页面加载失败</span>
          <span class="error-detail">{{ activeTabLoadError.errorDescription || '未知错误' }} ({{ activeTabLoadError.errorCode }})</span>
        </div>
        <button class="error-retry-btn" @click="retryActiveTabLoad">重试</button>
      </div>
      <div v-if="hasPermissionPrompt && currentPermissionPrompt" class="browser-permission-banner">
        <div class="permission-main">
          <span class="permission-title">站点权限请求</span>
          <span class="permission-detail">
            {{ currentPermissionPrompt.host }} 想要访问{{ currentPermissionLabel }}
          </span>
          <span v-if="queuedPermissionPromptCount > 0" class="permission-meta">
            还有 {{ queuedPermissionPromptCount }} 个待处理请求
          </span>
        </div>
        <div class="permission-actions">
          <button class="permission-btn" @click="respondToPermissionPrompt('allow', false)">允许一次</button>
          <button class="permission-btn primary" @click="respondToPermissionPrompt('allow', true)">总是允许此站点</button>
          <button class="permission-btn danger" @click="respondToPermissionPrompt('deny', false)">拒绝</button>
        </div>
      </div>
      <div v-if="webAuthnDiagnosticsVisible" class="browser-error-banner">
        <div class="error-main">
          <span class="error-title">WebAuthn 诊断</span>
          <span v-if="webAuthnDiagnostics" class="error-detail">
            credentials={{ webAuthnDiagnostics.hasCredentials ? 'yes' : 'no' }},
            publicKey={{ webAuthnDiagnostics.hasPublicKeyCredential ? 'yes' : 'no' }},
            create={{ webAuthnDiagnostics.hasCreate ? 'yes' : 'no' }},
            get={{ webAuthnDiagnostics.hasGet ? 'yes' : 'no' }},
            conditional={{ webAuthnDiagnostics.conditionalMediation ? 'yes' : 'no' }}
          </span>
          <span v-else class="error-detail">{{ webAuthnDiagnosticsMessage }}</span>
        </div>
      </div>
      <!-- 网页内容 -->
      <div class="browser-main" v-if="isBrowserReady">
        <!-- 所有标签页 - 每个 NewTabPage 自己控制显示/隐藏 -->
        <NewTabPage
          v-for="tab in browserTabs"
          :key="tab.id"
          class="tab-panel"
          :data-tab-id="tab.id"
          :tab-id="tab.id"
          :route-type="getTabRouteType(tab)"
          :route-props="tab.routeProps"
          :content-host="tab.contentHost || 'webcontentsview'"
          :src="tab.routeConfig?.showWebview ? (tab.initialUrl || 'about:blank') : 'about:blank'"
          :user-agent="userAgent"
          :favorite-project-paths="favoriteProjectPaths"
          :is-active="tab.id === activeBrowserTabId"
          @navigate="openInNewTab"
          @navigate-current="(url) => openInCurrentTab(url, tab.id)"
          @did-start-loading="(e, tabId) => onLoadStart(e, tabId)"
          @did-stop-loading="(e, tabId) => onLoadStop(e, tabId)"
          @did-navigate="(e, tabId) => onNavigate(e, tabId)"
          @did-navigate-in-page="(e, tabId) => onNavigateInPage(e, tabId)"
          @new-window="(e, tabId) => onNewWindow(e, tabId)"
          @dom-ready="(e, tabId) => onDomReady(e, tabId)"
          @did-fail-load="(e, tabId) => onLoadFail(e, tabId)"
          @webview-ready="(webview, tabId) => onWebviewReady(webview, tabId)"
          @navigation-state-changed="(state, tabId) => onNavigationStateChanged(state, tabId)"
          @title-updated="(title, tabId) => onTitleUpdatedFromWebView(title, tabId)"
          @favicon-updated="(favicon, tabId) => onFaviconUpdated(favicon, tabId)"
          @project-branch-changed="(payload) => emit('project-branch-changed', payload)"
          @project-status-updated="(payload) => emit('project-status-updated', payload)"
          @project-pending-status-changed="(payload) => emit('project-pending-status-changed', payload)"
          @toggle-project-favorite="(payload) => emit('toggle-project-favorite', payload)"
        />
      </div>
      <DownloadPanel
        :visible="showDownloadPanel"
        :items="downloadItems"
        @close="showDownloadPanel = false"
        @open-folder="openDownloadFolder"
        @retry="retryDownload"
        @clear-completed="clearCompletedDownloads"
      />
      <SitePermissionPanel
        :panel="sitePermissionPanelView"
        @close="closeSitePermissionPanel"
        @reset="resetSitePermission"
        @reset-all="resetAllSitePermissions"
      />
      <PasswordSaveDialog
        :visible="showPasswordSaveDialog"
        :data="passwordSaveData"
        @confirm="handleConfirmSavePassword"
        @cancel="cancelSavePassword"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import NewTabPage from './NewTabPage.vue'
import DownloadPanel from './DownloadPanel.vue'
import SitePermissionPanel from './SitePermissionPanel.vue'
import PasswordSaveDialog from '../dialog/PasswordSaveDialog.vue'
import { useFavorites } from '../../composables/useFavorites'
import { usePasswords } from '../../composables/usePasswords'
import { useBrowsingHistory } from '../../composables/useBrowsingHistory'
import { useSitePermissionPrompt } from '../../composables/useSitePermissionPrompt.js'
import { useDownloadManager } from '../../composables/useDownloadManager.js'
import { useSitePermissionPanel } from '../../composables/useSitePermissionPanel.js'
import { useBrowserShortcuts } from '../../composables/useBrowserShortcuts.js'
import { useBrowserNavigationState } from '../../composables/useBrowserNavigationState.js'
import { useBrowserPersistence } from '../../composables/useBrowserPersistence.js'
import { useBrowserTabs } from '../../composables/useBrowserTabs.js'
import { 
  ArrowLeft, 
  ArrowRight, 
  RefreshCw, 
  Home as HomeIcon, 
  Star, 
  Globe,
  X,
  Loader,
  MoreVertical,
  Key,
  Bookmark,
  Folder,
  Cloud,
  FileText,
  History,
  HardDrive,
  Download,
  Puzzle,
  Terminal,
  GitBranch
} from 'lucide-vue-next'
import HistoryManager from './HistoryManager.vue'
import BackupManager from '../BackupManager.vue'
import ExtensionManager from '../ExtensionManager.vue'
import { createBrowserContentAdapter } from './browserContentAdapter'
import {
  findBestMatchingPassword,
  buildPasswordSaveDecision
} from '../../composables/webPasswordUtils.mjs'

const emit = defineEmits([
  'project-context-changed',
  'project-branch-changed',
  'project-status-updated',
  'project-pending-status-changed',
  'toggle-project-favorite'
])

const props = defineProps({
  initialUrl: {
    type: String,
    default: ''
  },
  leadingTabInset: {
    type: Number,
    default: 0
  },
  favoriteProjectPaths: {
    type: Array,
    default: () => []
  }
})

const browserContentRef = ref(null)
let browserContentAdapter = null

// ==================== 路由配置系统 ====================
// 定义所有页面类型的路由规则
const routeConfig = {
  // 收藏管理路由
  'favorites-manager': {
    pattern: /^about:favorites$/,
    component: 'Favorites',
    title: '收藏管理',
    icon: 'Bookmark',
    showWebview: false,
    defaultUrl: 'about:favorites'
  },
  // 密码管理路由
  'password-manager': {
    pattern: /^about:password$/,
    component: 'PasswordManager',
    title: '密码管理',
    icon: 'Key',
    showWebview: false,
    defaultUrl: 'about:password'
  },
  // 远端仓库路由
  'remote-repo': {
    pattern: /^git:remote$/,
    component: 'RemoteRepo',
    title: '远端仓库',
    icon: 'Cloud',
    showWebview: false,
    defaultUrl: 'git:remote'
  },
  // 历史记录路由
  'browsing-history': {
    pattern: /^about:history$/,
    component: 'HistoryManager',
    title: '历史记录',
    icon: 'History',
    showWebview: false,
    defaultUrl: 'about:history'
  },
  // 备份管理路由
  'backup-manager': {
    pattern: /^about:backup$/,
    component: 'BackupManager',
    title: '备份管理',
    icon: 'HardDrive',
    showWebview: false,
    defaultUrl: 'about:backup'
  },
  // 扩展管理路由（支持 about:extensions 和 chrome://extensions）
  'extension-manager': {
    pattern: /^(about:extensions|chrome:\/\/extensions)$/,
    component: 'ExtensionManager',
    title: '扩展管理',
    icon: 'Puzzle',
    showWebview: false,
    defaultUrl: 'about:extensions'
  },
  // 克隆目录路由（多个仓库）
  'clone-directory': {
    pattern: /^git:clone:(.+)$/,
    component: 'ProjectDetail',
    title: (url) => {
      const path = url.replace('git:clone:', '')
      const pathParts = path.split('/')
      return pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || '克隆目录'
    },
    icon: 'Folder',
    showWebview: false,
    extractProps: (url) => {
      const path = url.replace('git:clone:', '')
      return { path }
    }
  },
  // 单个 Git 仓库路由
  'single-project': {
    pattern: /^git:project:(.+)$/,
    component: 'ProjectDetail',
    title: (url) => {
      const path = url.replace('git:project:', '')
      const pathParts = path.split('/')
      return pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || 'Git 仓库'
    },
    icon: 'GitBranch',
    showWebview: false,
    extractProps: (url) => {
      const path = url.replace('git:project:', '')
      return { path }
    }
  },
  // 独立终端路由
  'standalone-terminal': {
    pattern: /^about:terminal$/,
    component: 'StandaloneTerminal',
    title: '终端',
    icon: 'Terminal',
    showWebview: false,
    defaultUrl: 'about:terminal'
  },
  // 多终端聚焦布局（新标签）
  'standalone-terminal-focus': {
    pattern: /^about:terminal-focus$/,
    component: 'FocusTerminalStack',
    title: '灵动终端',
    icon: 'Terminal',
    showWebview: false,
    defaultUrl: 'about:terminal-focus'
  },
  'standalone-terminal-split': {
    pattern: /^about:terminal-split$/,
    component: 'StandaloneSplitTerminal',
    title: '终端（分屏）',
    icon: 'Terminal',
    showWebview: false,
    defaultUrl: 'about:terminal-split'
  },
  // 普通网页路由（默认）
  webview: {
    pattern: /^https?:\/\/.+|^file:\/\/.+|^about:blank/,
    component: 'WebView',
    title: null, // 从网页获取
    icon: 'Globe',
    showWebview: true,
    defaultUrl: 'about:blank'
  }
}

// 根据 URL 解析路由信息
const parseRoute = (url) => {
  // 空字符串、about:blank 或 null/undefined 表示新标签页
  if (!url || url === '' || url === 'about:blank' || url === 'about:home') {
    return {
      type: 'new-tab',
      config: { showWebview: false },
      props: {},
      url: '',
      title: '新标签页'
    }
  }

  // 旧版内置编辑器 tab（editor:…）已移除，恢复为仓库详情
  if (typeof url === 'string' && url.startsWith('editor:')) {
    url = `git:project:${url.slice('editor:'.length)}`
  }
  
  // 按优先级匹配路由
  for (const [type, config] of Object.entries(routeConfig)) {
    if (type === 'webview') continue // webview 是默认路由，最后匹配
    
    const match = url.match(config.pattern)
    if (match) {
      const props = config.extractProps ? config.extractProps(url) : {}
      const title = typeof config.title === 'function' ? config.title(url) : config.title
      return {
        type,
        config,
        props,
        url,
        title
      }
    }
  }
  
  // 默认匹配 webview 路由
  return {
    type: 'webview',
    config: routeConfig.webview,
    props: {},
    url
  }
}

// 浏览器标签页管理
const browserTabs = ref([])
const activeBrowserTabId = ref(null)
const isBrowserReady = ref(false) // 标记浏览器组件是否已准备好
let nextBrowserTabId = 1
const isRestoringTabs = ref(false) // 标记是否正在恢复标签页

// 标签拖拽相关
const draggingTabId = ref(null) // 正在拖拽的标签 ID
const dragOverTabId = ref(null) // 拖拽悬停的目标标签 ID
let draggingTabIndex = -1 // 正在拖拽的标签索引
const tabOrder = ref({}) // 标签显示顺序 { tabId: orderIndex }

// 当前活动标签页的状态
const currentTab = computed(() => {
  return browserTabs.value.find(tab => tab.id === activeBrowserTabId.value)
})

const emitProjectContext = () => {
  const tab = currentTab.value
  if (!tab) {
    emit('project-context-changed', { path: '', routeType: '' })
    return
  }

  const routeType = tab.routeType || ''
  const path = tab.routeProps?.path || ''
  if (routeType === 'clone-directory' || routeType === 'single-project') {
    emit('project-context-changed', { path, routeType })
    return
  }

  emit('project-context-changed', { path: '', routeType })
}

const getOpenedProjectPaths = () => {
  const paths = new Set()
  for (const tab of browserTabs.value) {
    const routeType = tab?.routeType || ''
    const path = tab?.routeProps?.path || ''
    if (!path) continue
    if (routeType === 'clone-directory' || routeType === 'single-project') {
      paths.add(path)
    }
  }
  return Array.from(paths)
}


// 获取标签页的路由类型 - 确保返回有效值
const getTabRouteType = (tab) => {
  if (!tab) return 'new-tab'
  return tab.routeType || 'new-tab'
}


const { pushClosedTab, popClosedTab } = useBrowserTabs()

// 状态（当前活动标签页的）
const {
  currentUrl,
  urlInput,
  loadingProgress,
  loadingProgressVisible,
  clearLoadingProgressTimers,
  startLoadingProgress,
  finishLoadingProgress
} = useBrowserNavigationState()
const urlInputRef = ref(null)
const webAuthnDiagnostics = ref(null)
const webAuthnDiagnosticsVisible = ref(false)
const webAuthnDiagnosticsMessage = ref('当前页面未返回 WebAuthn 诊断数据')

const syncLoadingProgressWithActiveTab = () => {
  if (currentTab.value?.routeType === 'webview' && currentTab.value.isLoading) {
    startLoadingProgress()
  } else {
    clearLoadingProgressTimers()
    loadingProgressVisible.value = false
    loadingProgress.value = 0
  }
}

const clearTabLoadError = (tab) => {
  if (!tab) return
  tab.loadError = null
}

const activeTabCrashed = computed(() => Boolean(currentTab.value?.isCrashed))
const activeTabLoadError = computed(() => {
  if (currentTab.value?.isCrashed) {
    return null
  }
  return currentTab.value?.loadError || null
})
const {
  items: downloadItems,
  upsert: upsertDownloadItem,
  remove: removeDownloadItem,
  clearCompleted: clearCompletedDownloadItems,
  markRetryable: markDownloadRetryable
} = useDownloadManager()

const {
  currentPermissionPrompt,
  hasPermissionPrompt,
  queuedPermissionPromptCount,
  enqueuePermissionPrompt,
  resolvePermissionPrompt,
  syncPermissionPromptActiveTab,
  clearPermissionPrompts
} = useSitePermissionPrompt()

const {
  snapshot: sitePermissionPanelSnapshot,
  open: openSitePermissionPanelState,
  close: closeSitePermissionPanelState,
  resetPermission: resetSitePermissionState,
  setPermissions: setSitePermissionPanelPermissions
} = useSitePermissionPanel()

const permissionLabels = {
  media: '摄像头或麦克风',
  geolocation: '位置信息',
  notifications: '通知权限',
  'clipboard-read': '剪贴板内容',
  'publickey-credentials-create': 'Passkey 创建',
  'publickey-credentials-get': 'Passkey 登录',
  pointerLock: '指针锁定'
}

const currentPermissionLabel = computed(() => {
  const permission = currentPermissionPrompt.value?.permission || ''
  return permissionLabels[permission] || permission || '敏感权限'
})

const sitePermissionPanelView = computed(() => {
  const panel = sitePermissionPanelSnapshot.value
  const permissions = panel.permissions || {}
  return {
    isOpen: Boolean(panel.isOpen),
    origin: panel.origin || '',
    partition: panel.partition || 'persist:main',
    partitionType: String(panel.partition || '').startsWith('temp:') ? '隐私' : '默认',
    items: Object.entries(permissions).map(([permission, value]) => ({
      permission,
      label: permissionLabels[permission] || permission,
      value
    }))
  }
})

const closeSitePermissionPanel = () => {
  closeSitePermissionPanelState()
}

const openSitePermissionPanel = async () => {
  const tabId = getActiveWebContentsViewTabId()
  if (!tabId || !window.electronAPI?.browserGetSitePermissions) {
    return
  }
  try {
    const result = await window.electronAPI.browserGetSitePermissions({ tabId })
    if (!result?.success) return
    openSitePermissionPanelState({
      origin: result.origin || '',
      partition: result.partition || 'persist:main',
      permissions: result.permissions || {}
    })
  } catch (error) {
    console.error('获取站点权限失败:', error)
  }
}

const resetSitePermission = async (permission) => {
  if (!permission) return
  const tabId = getActiveWebContentsViewTabId()
  if (!tabId || !window.electronAPI?.browserResetSitePermission) return
  try {
    const result = await window.electronAPI.browserResetSitePermission({ tabId, permission })
    if (result?.success) {
      resetSitePermissionState(permission)
    }
  } catch (error) {
    console.error('重置站点权限失败:', error)
  }
}

const resetAllSitePermissions = async () => {
  const tabId = getActiveWebContentsViewTabId()
  if (!tabId || !window.electronAPI?.browserResetAllSitePermissions) return
  try {
    const result = await window.electronAPI.browserResetAllSitePermissions({ tabId })
    if (result?.success) {
      const current = sitePermissionPanelSnapshot.value.permissions || {}
      const resetValues = {}
      for (const permission of Object.keys(current)) {
        resetValues[permission] = 'unset'
      }
      setSitePermissionPanelPermissions(resetValues)
    }
  } catch (error) {
    console.error('重置全部站点权限失败:', error)
  }
}

const retryActiveTabLoad = () => {
  if (!currentTab.value) return
  if (currentTab.value.isCrashed) {
    restoreActiveWebTab()
    return
  }
  clearTabLoadError(currentTab.value)
  if (currentTab.value.routeType === 'webview') {
    if (browserContentAdapter.reload(currentTab.value)) {
      return
    }
  }
  refresh()
}

const runWebAuthnDiagnostics = async () => {
  if (!currentTab.value || currentTab.value.routeType !== 'webview' || !browserContentAdapter?.getWebAuthnDiagnostics) {
    webAuthnDiagnostics.value = null
    webAuthnDiagnosticsMessage.value = '当前标签页不是网页内容，无法诊断'
    return
  }
  try {
    webAuthnDiagnostics.value = await browserContentAdapter.getWebAuthnDiagnostics(currentTab.value)
    if (!webAuthnDiagnostics.value) {
      webAuthnDiagnosticsMessage.value = '当前页面禁止脚本读取或未暴露 WebAuthn 接口'
    }
  } catch (error) {
    console.error('WebAuthn 诊断失败:', error)
    webAuthnDiagnostics.value = null
    webAuthnDiagnosticsMessage.value = 'WebAuthn 诊断执行失败'
  }
}

const toggleWebAuthnDiagnostics = async () => {
  if (webAuthnDiagnosticsVisible.value) {
    webAuthnDiagnosticsVisible.value = false
    return
  }
  await runWebAuthnDiagnostics()
  webAuthnDiagnosticsVisible.value = true
}

const restoringWebTabIds = new Set()

const restoreWebContentsViewTab = async (tab, { activate = true } = {}) => {
  if (!tab || !isWebContentsViewTab(tab) || !window.electronAPI?.webTabRestore) {
    return false
  }

  const webTabId = getWebContentsViewTabId(tab)
  if (!webTabId || restoringWebTabIds.has(webTabId)) {
    return false
  }

  restoringWebTabIds.add(webTabId)
  try {
    const restoreUrl = normalizeUrl(tab.url || tab.initialUrl || 'about:blank')
    const result = await window.electronAPI.webTabRestore({
      tabId: webTabId,
      url: restoreUrl
    })
    if (!result?.success) {
      return false
    }

    tab.__webContentsCreated = true
    tab.isCrashed = false
    tab.lifecyclePhase = 'warm'
    clearTabLoadError(tab)
    if (activate && tab.id === activeBrowserTabId.value) {
      await activateWebContentsViewTab(tab)
    }
    return true
  } catch (error) {
    console.error('恢复 WebContentsView 标签页失败:', error)
    return false
  } finally {
    restoringWebTabIds.delete(webTabId)
  }
}

const restoreActiveWebTab = async () => {
  if (!currentTab.value) {
    return
  }
  await restoreWebContentsViewTab(currentTab.value, { activate: true })
}

const getActiveWebContentsViewTabId = () => {
  if (!currentTab.value || !isWebContentsViewTab(currentTab.value)) {
    return ''
  }

  return getWebContentsViewTabId(currentTab.value)
}

const evaluateWebContentsTab = async (tab, script) => {
  if (!tab || !isWebContentsViewTab(tab) || !window.electronAPI?.webTabEvaluate || !script) {
    return null
  }
  const result = await window.electronAPI.webTabEvaluate({
    tabId: getWebContentsViewTabId(tab),
    script
  })
  if (!result?.success) {
    return null
  }
  return result.result
}

const maybeShowPasswordSaveDialog = async (tab, captured) => {
  if (!captured?.username || !captured?.password || !captured?.domain || showPasswordSaveDialog.value) {
    return
  }

  const webTabId = getWebContentsViewTabId(tab)
  const signature = `${captured.domain}::${captured.username}::${captured.password}`
  if (passwordCapturedSignatures.get(webTabId) === signature) {
    return
  }
  passwordCapturedSignatures.set(webTabId, signature)

  const existing = findPassword(captured.domain, captured.username)
  const decision = buildPasswordSaveDecision({
    captured,
    existing,
    filled: filledPasswordByTabId.get(webTabId) || null
  })

  if (!decision.shouldPrompt) {
    return
  }

  passwordSaveData.value = {
    username: captured.username,
    password: captured.password,
    domain: captured.domain,
    isUpdate: Boolean(decision.isUpdate),
    id: decision.existingId || existing?.id || null
  }
  showPasswordSaveDialog.value = true
}

const handleWebTabPasswordCaptured = async (payload = {}) => {
  const tab = browserTabs.value.find(t => getWebContentsViewTabId(t) === payload?.tabId)
  if (!tab || tab.isPrivate) {
    return
  }
  if (tab.id !== activeBrowserTabId.value) {
    return
  }
  await maybeShowPasswordSaveDialog(tab, payload)
}

const tryAutofillPasswordForTab = async (tab) => {
  if (!tab || tab.isPrivate) return
  const webTabId = getWebContentsViewTabId(tab)
  const currentUrl = tab.url || ''
  if (!currentUrl || !currentUrl.startsWith('http')) return
  if (lastFilledUrlByTabId.get(webTabId) === currentUrl) return

  const matched = findBestMatchingPassword(savedPasswords.value, currentUrl)
  if (!matched?.username || !matched?.password) return

  const fillScript = `(() => {
    const username = ${JSON.stringify(matched.username)}
    const password = ${JSON.stringify(matched.password)}
    const usernameInput = document.querySelector('input[type="email"],input[name*="user" i],input[name*="login" i],input[id*="user" i],input[id*="login" i],input[type="text"]')
    const passwordInput = document.querySelector('input[type="password"]')
    if (!passwordInput) return { filled: false }

    const setInputValue = (input, value) => {
      if (!input) return
      input.focus()
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    }

    if (usernameInput && !usernameInput.value) {
      setInputValue(usernameInput, username)
    }
    if (!passwordInput.value) {
      setInputValue(passwordInput, password)
    }

    return {
      filled: true,
      usernameFilled: Boolean(usernameInput),
      passwordFilled: true
    }
  })()`

  const result = await evaluateWebContentsTab(tab, fillScript)
  if (!result?.filled) return

  filledPasswordByTabId.set(webTabId, {
    username: matched.username,
    password: matched.password,
    domain: (() => {
      try {
        return new URL(currentUrl).hostname
      } catch {
        return ''
      }
    })()
  })
  lastFilledUrlByTabId.set(webTabId, currentUrl)
}

const runPasswordAutomationForTab = async (tab) => {
  if (!tab || !isWebContentsViewTab(tab) || tab.routeType !== 'webview') return
  if (tab.isPrivate) return

  if (!tab.isLoading) {
    await tryAutofillPasswordForTab(tab)
  }
}

const handleConfirmSavePassword = async (data) => {
  const { username, password, domain, isUpdate, id } = data || {}
  if (!username || !password || !domain) {
    return
  }
  if (isUpdate && id) {
    await updatePassword(id, username, password, domain)
  } else {
    await savePassword(username, password, domain)
  }
  showPasswordSaveDialog.value = false
  passwordSaveData.value = { username: '', password: '', domain: '', isUpdate: false, id: null }
}

const cancelSavePassword = () => {
  showPasswordSaveDialog.value = false
  passwordSaveData.value = { username: '', password: '', domain: '', isUpdate: false, id: null }
}

const denyPermissionRequests = (prompts = []) => {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return
  }

  for (const prompt of prompts) {
    const requestId = prompt?.requestId
    if (!requestId || !window.electronAPI?.browserRespondToPermissionRequest) {
      continue
    }

    window.electronAPI.browserRespondToPermissionRequest({
      requestId,
      decision: 'deny',
      remember: false
    }).catch((error) => {
      console.warn('拒绝过期权限请求失败:', requestId, error)
    })
  }
}

const syncPermissionPromptForActiveTab = () => {
  const removedPrompts = syncPermissionPromptActiveTab(getActiveWebContentsViewTabId())
  denyPermissionRequests(removedPrompts)
}

const respondToPermissionPrompt = async (decision, remember = false) => {
  const prompt = currentPermissionPrompt.value
  if (!prompt?.requestId) {
    return
  }

  try {
    await window.electronAPI?.browserRespondToPermissionRequest?.({
      requestId: prompt.requestId,
      decision,
      remember
    })
  } catch (error) {
    console.error('响应站点权限请求失败:', error)
  } finally {
    resolvePermissionPrompt(prompt.requestId)
    syncPermissionPromptForActiveTab()
  }
}

// 监听标签页切换，同步状态（不重新加载 webview）
watch(() => activeBrowserTabId.value, (newTabId, oldTabId) => {
  closeSitePermissionPanel()
  webAuthnDiagnosticsVisible.value = false
  webAuthnDiagnostics.value = null
  const tab = browserTabs.value.find(t => t.id === newTabId)
  if (!tab) {
    syncPermissionPromptForActiveTab()
    return
  }
  
  // 如果标签页 ID 没有变化，不更新 urlInput（避免覆盖刚设置的值）
  if (newTabId === oldTabId) {
    return
  }
  
  console.log('🔄 标签页切换，同步状态:', { tabId: tab.id, routeType: tab.routeType, url: tab.url })
  
  // 同步状态（从标签页数据同步到当前状态）- 只更新 UI，不触发 webview 加载
  if (tab.routeType === 'password-manager') {
    currentUrl.value = 'about:password'
    urlInput.value = 'about:password'
  } else if (tab.routeType === 'favorites-manager') {
    currentUrl.value = 'about:favorites'
    urlInput.value = 'about:favorites'
  } else if (tab.routeType === 'remote-repo') {
    currentUrl.value = 'git:remote'
    urlInput.value = 'git:remote'
  } else if (tab.routeType === 'clone-directory') {
    currentUrl.value = tab.url || 'git:clone'
    urlInput.value = tab.url || 'git:clone'
  } else if (tab.routeType === 'single-project') {
    currentUrl.value = tab.url || 'git:project'
    urlInput.value = tab.url || 'git:project'
  } else if (tab.routeType === 'standalone-terminal') {
    currentUrl.value = 'about:terminal'
    urlInput.value = 'about:terminal'
  } else if (tab.routeType === 'standalone-terminal-focus') {
    currentUrl.value = 'about:terminal-focus'
    urlInput.value = 'about:terminal-focus'
  } else if (tab.routeType === 'standalone-terminal-split') {
    currentUrl.value = 'about:terminal-split'
    urlInput.value = 'about:terminal-split'
  } else if (tab.routeType === 'new-tab') {
    // 新标签页：输入框为空，等待用户输入
        currentUrl.value = ''
    urlInput.value = ''
      } else {
    // webview 类型：显示 URL，但不重新加载
    const urlToShow = tab.url || ''
        currentUrl.value = urlToShow
        urlInput.value = urlToShow
  }
  
  // 更新导航状态
  updateNavigationState()
  syncLoadingProgressWithActiveTab()
  syncActiveContentHost()
  syncPermissionPromptForActiveTab()
  if (isWebContentsViewTab(tab)) {
    runPasswordAutomationForTab(tab).catch((error) => {
      console.warn('密码自动化执行失败:', error)
    })
  }
}, { immediate: true })
// 当前活动标签页的状态（从 currentTab 同步）
const canGoBack = computed(() => {
  if (!currentTab.value) return false
  // webview 的返回能力 或 标签页自己的历史记录
  return currentTab.value.canGoBack || (currentTab.value.history && currentTab.value.history.length > 0)
})
const canGoForward = computed(() => currentTab.value?.canGoForward || false)
const isLoading = computed(() => currentTab.value?.isLoading || false)
const pageTitle = computed(() => currentTab.value?.title || '')
const showBrowserToolbar = computed(() => {
  const routeType = currentTab.value?.routeType || 'new-tab'
  return routeType === 'webview' || routeType === 'new-tab' || routeType === 'browser-tab'
})
const leadingWindowControlsSpace = computed(() => 0)
const leadingTabInsetCss = computed(() => `${Math.max(0, Number(props.leadingTabInset) || 0)}px`)

const isLeadingTab = (tabId) => {
  if (!browserTabs.value.length) return false
  let leadingId = browserTabs.value[0]?.id
  let minOrder = Infinity

  for (const tab of browserTabs.value) {
    const order = getTabOrder(tab.id)
    if (order < minOrder) {
      minOrder = order
      leadingId = tab.id
    }
  }

  return String(leadingId) === String(tabId)
}

// 使用 composables
const {
  favorites,
  loadFavorites,
  addFavorite: addFavoriteToStore,
  removeFavorite,
  exportFavorites,
  importFavorites,
  isUrlFavorited
} = useFavorites()

const {
  savedPasswords,
  loadSavedPasswords,
  savePassword,
  updatePassword,
  deletePassword,
  findPassword,
  clearAllPasswords,
  deletePasswordByDomain
} = usePasswords()

const showPasswordSaveDialog = ref(false)
const passwordSaveData = ref({ username: '', password: '', domain: '', isUpdate: false, id: null })
const filledPasswordByTabId = new Map()
const lastFilledUrlByTabId = new Map()
const passwordCapturedSignatures = new Map()


// 菜单相关
const showMenu = ref(false)
const showDownloadPanel = ref(false)

// 菜单位置
const menuPosition = ref({ top: 0, right: 0 })
const getMenuButtonElement = () => document.querySelector('.tabs-bar-menu-wrapper .toolbar-btn, .toolbar-menu-wrapper .toolbar-btn')
const collectNativePopupTheme = () => {
  const themeStyles = window.getComputedStyle(document.documentElement)
  return {
    colorScheme: themeStyles.colorScheme === 'light' ? 'light' : 'dark',
    menuBg: themeStyles.getPropertyValue('--theme-sem-bg-menu').trim(),
    surface: themeStyles.getPropertyValue('--theme-sem-surface-1').trim(),
    border: themeStyles.getPropertyValue('--theme-sem-border-default').trim(),
    borderStrong: themeStyles.getPropertyValue('--theme-sem-border-strong').trim(),
    textPrimary: themeStyles.getPropertyValue('--theme-sem-text-primary').trim(),
    textSecondary: themeStyles.getPropertyValue('--theme-sem-text-secondary').trim(),
    textMuted: themeStyles.getPropertyValue('--theme-sem-text-muted').trim(),
    hover: themeStyles.getPropertyValue('--theme-sem-hover').trim(),
    selectedBg: themeStyles.getPropertyValue('--theme-comp-sidebar-item-active-bg').trim(),
    selectedBorder: themeStyles.getPropertyValue('--theme-comp-sidebar-item-active-border').trim()
  }
}

// 切换菜单显示
const toggleMenu = () => {
  if (window.electronAPI?.showBrowserFloatingMenu) {
    const menuBtn = getMenuButtonElement()
    if (!menuBtn) return
    const rect = menuBtn.getBoundingClientRect()
    const anchor = {
      // 与旧版 right: 0 保持一致：按窗口右边缘对齐
      x: Math.round(window.screenX + window.innerWidth),
      y: Math.round(window.screenY + rect.bottom + 4),
      theme: collectNativePopupTheme()
    }
    window.electronAPI.showBrowserFloatingMenu(anchor).then((action) => {
      if (!action) return
      handleNativeMenuAction(action)
    }).catch((error) => {
      console.error('显示浮层菜单失败:', error)
    })
    return
  }

  if (!showMenu.value) {
    // 计算菜单位置
    nextTick(() => {
      const menuBtn = getMenuButtonElement()
      if (menuBtn) {
        const rect = menuBtn.getBoundingClientRect()
        menuPosition.value = {
          top: rect.bottom + 4,
          right: 0 // 贴着窗口右边，不留间距
        }
      }
    })
  }
  showMenu.value = !showMenu.value
}

const openDownloadPanel = () => {
  showMenu.value = false
  showDownloadPanel.value = true
}

const openDownloadFolder = async (downloadId) => {
  if (!downloadId) return
  try {
    await window.electronAPI?.browserOpenDownloadFolder?.({ id: downloadId })
  } catch (error) {
    console.error('打开下载目录失败:', error)
  }
}

const retryDownload = async (downloadId) => {
  if (!downloadId) return
  try {
    const result = await window.electronAPI?.browserRetryDownload?.({ id: downloadId })
    if (result?.success) {
      markDownloadRetryable(downloadId, false)
    }
  } catch (error) {
    console.error('重试下载失败:', error)
  }
}

const clearCompletedDownloads = async () => {
  clearCompletedDownloadItems()
  try {
    await window.electronAPI?.browserClearDownloadHistory?.()
  } catch (error) {
    console.error('清理下载历史失败:', error)
  }
}

const handleNativeMenuAction = (action) => {
  switch (action) {
    case 'remote-repo':
      openRemoteRepo()
      break
    case 'favorites-manager':
      openFavoritesManager()
      break
    case 'browsing-history':
      openBrowsingHistory()
      break
    case 'password-manager':
      openPasswordManager()
      break
    case 'download-panel':
      openDownloadPanel()
      break
    case 'standalone-terminal':
      openStandaloneTerminal()
      break
    case 'standalone-terminal-split':
      openStandaloneSplitTerminal()
      break
    case 'backup-manager':
      openBackupManager()
      break
    default:
      break
  }
}

// 打开密码网站
const openPasswordSite = (domain) => {
  const url = `https://${domain}`
  const tab = createBrowserTab(url)
  switchBrowserTab(tab.id)
}

// 打开收藏管理
const openFavoritesManager = () => {
  console.log('📚 打开收藏管理')
  showMenu.value = false
  // 检查是否已经有收藏管理标签页
  const existingTab = browserTabs.value.find(tab => tab.type === 'favorites-manager')
  if (existingTab) {
    console.log('📚 找到已存在的收藏管理标签页:', existingTab.id)
    switchBrowserTab(existingTab.id)
    currentUrl.value = 'about:favorites'
    urlInput.value = 'about:favorites'
  } else {
    console.log('📚 创建新的收藏管理标签页')
    // 创建新的收藏管理标签页
    const tab = createBrowserTab('about:favorites', '收藏管理')
    tab.type = 'favorites-manager'
    console.log('📚 创建的标签页:', tab)
    switchBrowserTab(tab.id)
    currentUrl.value = 'about:favorites'
    urlInput.value = 'about:favorites'
  }
}

// 打开密码管理
const openPasswordManager = () => {
  console.log('🔐 打开密码管理')
  showMenu.value = false
  // 检查是否已经有密码管理标签页
  const existingTab = browserTabs.value.find(tab => tab.type === 'password-manager')
  if (existingTab) {
    console.log('🔐 找到已存在的密码管理标签页:', existingTab.id)
    switchBrowserTab(existingTab.id)
    currentUrl.value = 'about:password'
    urlInput.value = 'about:password'
  } else {
    console.log('🔐 创建新的密码管理标签页')
    // 创建新的密码管理标签页
    const tab = createBrowserTab('about:password', '密码管理')
    tab.type = 'password-manager'
    console.log('🔐 创建的标签页:', tab)
    switchBrowserTab(tab.id)
    currentUrl.value = 'about:password'
    urlInput.value = 'about:password'
  }
}

// 打开远端仓库
const openRemoteRepo = () => {
  console.log('⚙️ 打开远端仓库')
  showMenu.value = false
  // 检查是否已经有远端仓库标签页
  const existingTab = browserTabs.value.find(tab => tab.type === 'remote-repo')
  if (existingTab) {
    console.log('⚙️ 找到已存在的远端仓库标签页:', existingTab.id)
    switchBrowserTab(existingTab.id)
    currentUrl.value = 'git:remote'
    urlInput.value = 'git:remote'
  } else {
    console.log('⚙️ 创建新的远端仓库标签页')
    // 创建新的远端仓库标签页
    const tab = createBrowserTab('git:remote', '远端仓库')
    tab.type = 'remote-repo'
    console.log('⚙️ 创建的标签页:', tab)
    switchBrowserTab(tab.id)
    currentUrl.value = 'git:remote'
    urlInput.value = 'git:remote'
  }
}

// 打开历史记录
const openBrowsingHistory = () => {
  console.log('📜 打开历史记录')
  showMenu.value = false
  // 检查是否已经有历史记录标签页
  const existingTab = browserTabs.value.find(tab => tab.type === 'browsing-history')
  if (existingTab) {
    console.log('📜 找到已存在的历史记录标签页:', existingTab.id)
    switchBrowserTab(existingTab.id)
    currentUrl.value = 'about:history'
    urlInput.value = 'about:history'
  } else {
    console.log('📜 创建新的历史记录标签页')
    const tab = createBrowserTab('about:history', '历史记录')
    tab.type = 'browsing-history'
    console.log('📜 创建的标签页:', tab)
    switchBrowserTab(tab.id)
    currentUrl.value = 'about:history'
    urlInput.value = 'about:history'
  }
}

// 打开备份管理
const openBackupManager = () => {
  console.log('💾 打开备份管理')
  showMenu.value = false
  // 检查是否已经有备份管理标签页
  const existingTab = browserTabs.value.find(tab => tab.type === 'backup-manager')
  if (existingTab) {
    console.log('💾 找到已存在的备份管理标签页:', existingTab.id)
    switchBrowserTab(existingTab.id)
    currentUrl.value = 'about:backup'
    urlInput.value = 'about:backup'
  } else {
    console.log('💾 创建新的备份管理标签页')
    const tab = createBrowserTab('about:backup', '备份管理')
    tab.type = 'backup-manager'
    console.log('💾 创建的标签页:', tab)
    switchBrowserTab(tab.id)
    currentUrl.value = 'about:backup'
    urlInput.value = 'about:backup'
  }
}

const openStandaloneTerminal = () => {
  showMenu.value = false
  const tab = createBrowserTab('about:terminal-focus', '灵动终端')
  tab.type = 'standalone-terminal-focus'
  switchBrowserTab(tab.id)
  currentUrl.value = 'about:terminal-focus'
  urlInput.value = 'about:terminal-focus'
}

const openStandaloneSplitTerminal = () => {
  showMenu.value = false
  const tab = createBrowserTab('about:terminal-split', '终端（分屏）')
  tab.type = 'standalone-terminal-split'
  switchBrowserTab(tab.id)
  currentUrl.value = 'about:terminal-split'
  urlInput.value = 'about:terminal-split'
}

const openExtensionManager = () => {
  console.log('🧩 打开扩展管理')
  showMenu.value = false
  // 检查是否已经有扩展管理标签页
  const existingTab = browserTabs.value.find(tab => tab.type === 'extension-manager')
  if (existingTab) {
    console.log('🧩 找到已存在的扩展管理标签页:', existingTab.id)
    switchBrowserTab(existingTab.id)
    currentUrl.value = 'about:extensions'
    urlInput.value = 'about:extensions'
  } else {
    console.log('🧩 创建新的扩展管理标签页')
    const tab = createBrowserTab('about:extensions', '扩展管理')
    tab.type = 'extension-manager'
    console.log('🧩 创建的标签页:', tab)
    switchBrowserTab(tab.id)
    currentUrl.value = 'about:extensions'
    urlInput.value = 'about:extensions'
  }
}

// ==================== 历史记录功能（使用 composable） ====================
const { browsingHistory, loadHistory: loadBrowsingHistory, addToHistory } = useBrowsingHistory()

// 右键菜单相关（已移至 Favorites.vue，这里只保留事件处理）

// Tooltip 状态
// 自动补全相关（合并 about 页面和历史记录）
const showSuggestions = ref(false)
/** 主进程地址栏联想浮层打开中（避免 blur 立刻关掉联想状态） */
const nativeUrlSuggestionsOpen = ref(false)
const suggestionIndex = ref(0)
const savedCloneDirectories = ref([]) // 保存的克隆目录列表
// 兼容旧变量名
const showAboutSuggestions = showSuggestions
const aboutSuggestionIndex = suggestionIndex

// 加载克隆目录列表
const loadCloneDirectories = async () => {
  try {
    if (window.electronAPI && window.electronAPI.getConfig) {
      const configs = await window.electronAPI.getConfig('savedConfigs') || []
      savedCloneDirectories.value = configs
    }
  } catch (error) {
    console.error('加载克隆目录失败:', error)
  }
}

// 基础 about 页面
const baseAboutPages = [
  { url: 'about:favorites', title: '收藏管理', icon: 'Bookmark' },
  { url: 'about:password', title: '密码管理', icon: 'Key' },
  { url: 'about:history', title: '历史记录', icon: 'History' },
  { url: 'about:backup', title: '备份管理', icon: 'HardDrive' },
  { url: 'about:terminal-focus', title: '灵动终端', icon: 'Terminal' },
  { url: 'about:terminal-split', title: '终端（分屏）', icon: 'Terminal' },
  { url: 'about:terminal', title: '终端（经典）', icon: 'Terminal' }
  // 扩展管理暂时隐藏
  // { url: 'about:extensions', title: '扩展管理', icon: 'Puzzle' }
]

// 基础 git 页面
const baseGitPages = [
  { url: 'git:remote', title: '远端仓库', icon: 'Cloud' }
]

// 根据输入过滤特殊页面（about: 和 git: 前缀）- 所有输入都匹配
const specialSuggestions = computed(() => {
  const input = urlInput.value.toLowerCase().trim()
  if (!input) return []

  // 所有内置页面
  const allBuiltinPages = [...baseAboutPages, ...baseGitPages]
  
  // 匹配内置页面
  let results = allBuiltinPages.filter(item =>
    item.url.toLowerCase().includes(input) ||
    item.title.toLowerCase().includes(input)
  )
  
  // 匹配克隆目录
  const cloneItems = savedCloneDirectories.value
    .filter(dir => dir && dir.path)
    .map(dir => {
      const pathParts = dir.path.split('/')
      const dirName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || '克隆目录'
      return {
        url: `git:clone:${dir.path}`,
        title: dirName,
        icon: 'Folder'
      }
    })
    .filter(item =>
      item.url.toLowerCase().includes(input) ||
      item.title.toLowerCase().includes(input)
    )
  
  return [...results, ...cloneItems]
})

// 兼容旧逻辑
const aboutSuggestions = computed(() => {
  const input = urlInput.value.toLowerCase().trim()
  if (!input || !input.startsWith('about')) return []

  // 基础页面
  let results = baseAboutPages.filter(item =>
    item.url.toLowerCase().includes(input) ||
    item.title.toLowerCase().includes(input)
  )

  // 克隆目录（about:clone 已改为 git:clone，这里保留兼容）
  const cloneItems = savedCloneDirectories.value
    .filter(dir => dir && dir.path)
    .map(dir => {
      const pathParts = dir.path.split('/')
      const dirName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || '克隆目录'
      return {
        url: `git:clone:${dir.path}`,
        title: dirName,
        icon: 'Folder'
      }
    })
    .filter(item =>
      item.url.toLowerCase().includes(input) ||
      item.title.toLowerCase().includes(input)
    )
  
  return [...results, ...cloneItems]
})

// 历史记录联想（去重，每个 URL 只显示一次）
const historySuggestions = computed(() => {
  const input = urlInput.value.toLowerCase().trim()
  if (!input || input.length < 2 || input.startsWith('about')) return []

  const seenUrls = new Set()
  return browsingHistory.value
    .filter(item => {
      // 匹配搜索条件
      const matches = (item.url && item.url.toLowerCase().includes(input)) ||
        (item.title && item.title.toLowerCase().includes(input))
      if (!matches) return false
      
      // 去重：每个 URL 只显示一次
      if (seenUrls.has(item.url)) return false
      seenUrls.add(item.url)
      return true
    })
    .slice(0, 8) // 最多显示 8 条
    .map(item => ({
      ...item,
      displayUrl: item.url, // 显示完整 URL
      isHistory: true
    }))
})

// 合并所有联想结果（特殊页面在上方，历史记录在下方）
const allSuggestions = computed(() => {
  const input = urlInput.value.toLowerCase().trim()
  if (!input) return []

  // 特殊页面（about: 和 git:）放在上方
  const special = specialSuggestions.value
  
  // 历史记录放在下方
  const history = historySuggestions.value
  
  return [...special, ...history]
})

const useNativeUrlSuggestions = computed(
  () =>
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.showBrowserUrlSuggestions === 'function'
)

// 输入框内容变化
const onUrlInputChange = () => {
  const input = urlInput.value.toLowerCase().trim()
  if (input.length >= 2 || input.startsWith('about') || input.startsWith('git')) {
    showSuggestions.value = true
    suggestionIndex.value = 0
    userSelectedSuggestion.value = false // 输入变化时重置选择状态
  } else {
    showSuggestions.value = false
    userSelectedSuggestion.value = false
  }
}

// 输入框获得焦点
const onUrlInputFocus = () => {
  const input = urlInput.value.toLowerCase().trim()
  if (input.length >= 2 || input.startsWith('about') || input.startsWith('git')) {
    showSuggestions.value = true
  }
}

// 输入框失去焦点
const onUrlInputBlur = () => {
  // 延迟关闭，让点击事件有时间触发；主进程联想浮层打开时不要关（否则会抢焦点）
  setTimeout(() => {
    if (nativeUrlSuggestionsOpen.value) return
    showAboutSuggestions.value = false
  }, 150)
}

// 记录用户是否主动选择了联想项（通过方向键或 Tab）
const userSelectedSuggestion = ref(false)

// 输入框键盘事件
const onUrlInputKeydown = (event) => {
  // 处理 Command+A (Mac) 或 Ctrl+A (Windows/Linux) 全选
  if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
    event.preventDefault()
    event.target.select()
    return
  }

  if (event.key === 'Enter' && event.altKey) {
    event.preventDefault()
    const targetUrl = normalizeUrl(urlInput.value.trim())
    if (targetUrl) {
      showSuggestions.value = false
      userSelectedSuggestion.value = false
      openNewTab(targetUrl)
    }
    return
  }

  if (!showSuggestions.value || allSuggestions.value.length === 0) {
    // 如果没有显示提示，正常处理 Enter
    if (event.key === 'Enter') {
      handleUrlInputEnter()
    }
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    userSelectedSuggestion.value = true // 用户主动选择
    // Tab 切换选中项
    if (event.shiftKey) {
      // Shift+Tab 向上
      suggestionIndex.value = (suggestionIndex.value - 1 + allSuggestions.value.length) % allSuggestions.value.length
    } else {
      // Tab 向下
      suggestionIndex.value = (suggestionIndex.value + 1) % allSuggestions.value.length
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    userSelectedSuggestion.value = true // 用户主动选择
    suggestionIndex.value = (suggestionIndex.value + 1) % allSuggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    userSelectedSuggestion.value = true // 用户主动选择
    suggestionIndex.value = (suggestionIndex.value - 1 + allSuggestions.value.length) % allSuggestions.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    showSuggestions.value = false

    // 只有当用户主动选择了联想建议时（通过方向键或Tab），才使用联想建议
    // 否则直接使用输入框中的 URL
    if (userSelectedSuggestion.value) {
      const selected = allSuggestions.value[suggestionIndex.value]
      if (selected) {
        selectSuggestion(selected)
      } else {
        handleUrlInputEnter()
      }
    } else {
      // 用户没有主动选择，直接使用输入框中的 URL
      handleUrlInputEnter()
    }
    userSelectedSuggestion.value = false // 重置
  } else if (event.key === 'Escape') {
    showSuggestions.value = false
    userSelectedSuggestion.value = false
    void window.electronAPI?.closeBrowserUrlSuggestions?.()
  }
}

// 选择联想提示项（about 页面或历史记录）
const selectSuggestion = async (item) => {
  showSuggestions.value = false

  // 导航到该页面
  await navigateToUrl(item.url, { forceCurrentTab: true })

  // 确保地址栏显示正确的 URL（在所有操作完成后）
  await nextTick()
  urlInput.value = item.url
  currentUrl.value = item.url
}

// 兼容旧函数名
const selectAboutSuggestion = selectSuggestion

let urlSuggestionDebounceTimer = null
let urlSuggestionIndexDebounceTimer = null

const handleUrlSuggestionResult = (payload) => {
  nativeUrlSuggestionsOpen.value = false
  if (payload && payload.url) {
    const item =
      allSuggestions.value.find((it) => it.url === payload.url) ||
      { url: payload.url, title: payload.title || '' }
    void selectSuggestion(item)
  } else {
    showSuggestions.value = false
  }
}

/** 关闭地址栏联想（内联列表 + 主进程浮层）；点击侧栏、标签栏等非地址栏区域时使用 */
function dismissUrlSuggestionsChrome() {
  nativeUrlSuggestionsOpen.value = false
  showSuggestions.value = false
  userSelectedSuggestion.value = false
  void window.electronAPI?.closeBrowserUrlSuggestions?.()
}

const onGlobalPointerDownDismissUrlSuggestions = (ev) => {
  if (!showSuggestions.value && !nativeUrlSuggestionsOpen.value) return
  const el = ev.target instanceof Element ? ev.target : ev.target?.parentElement
  if (!el) return
  if (typeof el.closest === 'function' && el.closest('.url-input-wrapper')) return
  dismissUrlSuggestionsChrome()
}

async function runNativeUrlSuggestionsPopup() {
  if (!useNativeUrlSuggestions.value) return
  if (!showSuggestions.value || !allSuggestions.value.length) {
    nativeUrlSuggestionsOpen.value = false
    try {
      await window.electronAPI?.closeBrowserUrlSuggestions?.()
    } catch {
      /* ignore */
    }
    return
  }

  const el = urlInputRef.value
  if (!el || !window.electronAPI?.showBrowserUrlSuggestions) return

  const rect = el.getBoundingClientRect()
  const itemsPayload = allSuggestions.value.map((item) => ({
    url: item.url,
    title: item.title || '',
    displayUrl: item.displayUrl || item.url,
    favicon: item.favicon || ''
  }))
  const popupTheme = collectNativePopupTheme()

  try {
    nativeUrlSuggestionsOpen.value = true
    const result = await window.electronAPI.showBrowserUrlSuggestions({
      x: Math.round(window.screenX + rect.left),
      y: Math.round(window.screenY + rect.bottom + 4),
      width: Math.round(rect.width),
      items: itemsPayload,
      selectedIndex: suggestionIndex.value,
      theme: popupTheme
    })
    if (!result || result.success === false) {
      nativeUrlSuggestionsOpen.value = false
    }
  } catch (error) {
    console.error('地址栏联想浮层失败:', error)
    nativeUrlSuggestionsOpen.value = false
  }
}

function scheduleNativeUrlSuggestions() {
  if (!useNativeUrlSuggestions.value) return
  clearTimeout(urlSuggestionDebounceTimer)
  urlSuggestionDebounceTimer = setTimeout(() => {
    urlSuggestionDebounceTimer = null
    void runNativeUrlSuggestionsPopup()
  }, 200)
}

watch(
  () => [
    useNativeUrlSuggestions.value,
    showSuggestions.value,
    allSuggestions.value.map((i) => `${i.url}\t${i.title}`).join('\n')
  ],
  () => {
    scheduleNativeUrlSuggestions()
  },
  { flush: 'post' }
)

watch(suggestionIndex, () => {
  if (!useNativeUrlSuggestions.value || !nativeUrlSuggestionsOpen.value) return
  clearTimeout(urlSuggestionIndexDebounceTimer)
  urlSuggestionIndexDebounceTimer = setTimeout(() => {
    void window.electronAPI?.setBrowserUrlSuggestionIndex?.({
      index: suggestionIndex.value
    })
  }, 40)
})

watch(nativeUrlSuggestionsOpen, (open) => {
  if (typeof window === 'undefined') return
  if (open && useNativeUrlSuggestions.value) {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        void window.electronAPI?.closeBrowserUrlSuggestions?.()
      }
    }
    window.__urlSuggestionEscHandler = onEsc
    window.addEventListener('keydown', onEsc, true)
  } else if (window.__urlSuggestionEscHandler) {
    window.removeEventListener('keydown', window.__urlSuggestionEscHandler, true)
    delete window.__urlSuggestionEscHandler
  }
})

const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipStyle = ref({})
let tooltipTimer = null
let tooltipHasShown = false // 记录tooltip是否曾经显示过
let isInTabsArea = false // 记录鼠标是否在标签区域内

// User Agent
const userAgent = ref('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

// 计算属性
// 以下 computed 属性已删除，因为 NewTabPage 通过 routeType 来决定渲染内容：
// - isHomePage, isFavoritesManagerPage, isPasswordManagerPage, isRemoteRepoPage, isCloneDirectoryPage

// 是否可以收藏当前页面
const canFavorite = computed(() => {
  if (!currentUrl.value) return false
  // 新标签页不支持收藏
  if (currentTab.value?.routeType === 'new-tab') return false
  // 浏览器内置的 about: 页面不支持收藏；其它 about: / git: 等由应用接管的可收藏
  const nonFavoritableUrls = ['about:blank', 'about:newtab', 'about:new-tab']
  if (nonFavoritableUrls.includes(currentUrl.value)) return false
  return true
})

const isCurrentUrlFavorited = computed(() => {
  if (!canFavorite.value) return false
  return isUrlFavorited(currentUrl.value)
})

// 以下 computed 属性已删除，因为 NewTabPage 通过 routeType 来决定渲染内容：
// - shouldShowHomePage, shouldShowFavoritesManager, shouldShowPasswordManager
// - shouldShowRemoteRepo, shouldShowCloneDirectory, shouldShowWebView

// 获取 WebView 的 src 属性 - 使用 initialUrl（只在创建时设置，避免响应式更新导致重复加载）
const getWebViewSrc = (tab) => {
  if (!tab) return ''
  
  // 如果路由配置不显示 webview，返回 about:blank（隐藏）
  if (!tab.routeConfig || !tab.routeConfig.showWebview) {
    return 'about:blank'
  }
  
  // 使用 initialUrl（创建时设置，不会因导航而变化）
  // 这样可以避免 onNavigate 更新 tab.url 时触发 Vue 重新设置 webview.src
  if (tab.initialUrl && tab.initialUrl !== '') {
    return tab.initialUrl
  }
  return 'about:blank'
}

// 方法
const buildSearchUrl = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`

const isLikelyUrlInput = (raw) => {
  if (!raw) return false
  const value = raw.trim()
  if (!value || /\s/.test(value)) return false
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) return true
  if (value.startsWith('about:') || value.startsWith('git:')) return true
  if (value.startsWith('localhost') || value.startsWith('127.0.0.1') || value.startsWith('[::1]')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)) return true
  return value.includes('.')
}

const normalizeUrl = (url, options = {}) => {
  const { allowSearch = true } = options
  if (!url) return ''
  const value = url.trim()
  if (!value) return ''

  if (value.startsWith('about:') || value.startsWith('git:')) {
    return value
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) {
    return value
  }

  if (allowSearch && !isLikelyUrlInput(value)) {
    return buildSearchUrl(value)
  }

  if (value.startsWith('localhost') || value.startsWith('127.0.0.1') || value.startsWith('[::1]')) {
    return `http://${value}`
  }

  return `https://${value}`
}

/**
 * 强制在新标签页打开 URL - 用于功能性页面的导航
 * @param {string} url - 要打开的 URL
 */
const openInNewTab = async (url) => {
  console.log('🆕 openInNewTab: 强制在新标签页打开:', url)
  if (!url) return
  
  // 解析路由，检查是否是克隆目录
  const route = parseRoute(url)
  
  // 如果是克隆目录，先检查是否已存在
  if (route.type === 'clone-directory') {
    const path = route.props.path
    const existingTab = browserTabs.value.find(tab =>
      tab.routeType === 'clone-directory' && tab.routeProps?.path === path
    )
    if (existingTab) {
      console.log('✅ 克隆目录已打开，切换到已存在的标签页:', existingTab.id)
      await switchBrowserTab(existingTab.id)
      return
    }
  }

  // 如果是单个仓库，先检查是否已存在
  if (route.type === 'single-project') {
    const path = route.props.path
    const existingTab = browserTabs.value.find(tab =>
      tab.routeType === 'single-project' && tab.routeProps?.path === path
    )
    if (existingTab) {
      console.log('✅ 单个仓库已打开，切换到已存在的标签页:', existingTab.id)
      await switchBrowserTab(existingTab.id)
      return
    }
  }

  await openNewTab(url)
}

const openProjectRoute = async (url) => {
  await openInNewTab(url)
}

/**
 * 在当前标签页打开 URL（用于新标签页点击收藏）
 */
const openInCurrentTab = async (url, tabId) => {
  console.log('🔄 openInCurrentTab: 在当前标签页打开:', url, tabId)
  if (!url) return
  
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (!tab) {
    console.log('⚠️ 找不到标签页:', tabId)
    return
  }
  clearTabLoadError(tab)
  
  // 解析 URL 获取路由信息
  const route = parseRoute(url)
  console.log('🔄 解析路由:', route)
  
  // 更新标签页信息
  tab.routeType = route.type
  tab.routeConfig = route.config // 重要：更新 routeConfig
  tab.routeProps = route.props
  tab.contentKind = route.config.showWebview ? 'web' : 'builtin'
  tab.contentHost = route.config.showWebview ? 'webcontentsview' : 'builtin'
  tab.url = route.url
  // 更新标题（优先使用 route.title，处理函数类型的 config.title）
  if (route.title) {
    tab.title = route.title
  } else if (route.config?.title) {
    const configTitle = route.config.title
    tab.title = typeof configTitle === 'function' ? configTitle(url) : configTitle
  } else {
    tab.title = ''
  }
  
  if (route.type === 'webview') {
    // WebView 类型：设置基础状态，实际加载走 WebContentsView
    tab.webviewSrc = route.url
    tab.initialUrl = route.url // 重要：更新 initialUrl，getWebViewSrc 使用它
    tab.pendingUrl = '' // 清空 pendingUrl，直接用 webviewSrc
    tab.webviewReady = true
    tab.initialLoadDone = false
    tab.isLoading = true // 开始加载
    
    // 设置需要保存历史记录（http/https URL）
    if (route.url && /^https?:\/\//i.test(route.url)) {
      tab.needsSaveHistory = true
    }
  } else {
    tab.needsSaveHistory = false
    tab.webviewReady = false
    destroyWebContentsViewTab(tab)
  }
  
  // 更新 UI 状态
  if (tab.id === activeBrowserTabId.value) {
    currentUrl.value = route.url
    // 对于所有类型都显示 URL（包括 about: 特殊页面）
    urlInput.value = route.url
  }

  if (route.type === 'webview') {
    await ensureWebContentsViewTab(tab, route.url)
    if (tab.id === activeBrowserTabId.value) {
      await activateWebContentsViewTab(tab)
      await window.electronAPI?.webTabNavigate?.({
        tabId: getWebContentsViewTabId(tab),
        url: normalizeUrl(route.url)
      })
    }
  } else if (tab.id === activeBrowserTabId.value) {
    await hideAllWebContentsViewTabs()
  }
  
  console.log('🔄 标签页更新后:', { 
    routeType: tab.routeType, 
    routeConfig: tab.routeConfig,
    webviewSrc: tab.webviewSrc 
  })
}

/**
 * 统一的导航函数 - 处理所有来源的导航（收藏、GitLab、手动输入等）
 * 使用路由系统，支持动态类型切换
 * @param {string} url - 要导航到的 URL
 * @param {object} options - 导航选项
 * @param {boolean} options.forceNewTab - 是否强制在新标签页打开（默认：根据当前标签页状态决定）
 * @param {boolean} options.forceCurrentTab - 是否强制在当前标签页打开（默认：根据当前标签页状态决定）
 */
const navigateToUrl = async (url, options = {}) => {
  console.log('🔗 navigateToUrl 被调用:', { url, options })
  
  if (!url) {
    console.warn('⚠️ navigateToUrl: URL 为空')
    return
  }
  
  const normalizedUrl = normalizeUrl(url)
  const route = parseRoute(normalizedUrl)
  
  // 处理需要单例的特殊页面（如 远端仓库、克隆目录）
  if (route.type === 'remote-repo') {
    const existingTab = browserTabs.value.find(tab => tab.routeType === 'remote-repo')
    if (existingTab) {
      console.log('✅ 找到已存在的远端仓库标签页:', existingTab.id)
      await switchBrowserTab(existingTab.id)
      return
    }
  } else if (route.type === 'clone-directory') {
    const path = route.props.path
    const existingTab = browserTabs.value.find(tab =>
      tab.routeType === 'clone-directory' && tab.routeProps.path === path
    )
    if (existingTab) {
      console.log('✅ 找到已存在的克隆目录标签页:', existingTab.id)
      await switchBrowserTab(existingTab.id)
      return
    }
  } else if (route.type === 'single-project') {
    const path = route.props.path
    const existingTab = browserTabs.value.find(tab =>
      tab.routeType === 'single-project' && tab.routeProps.path === path
    )
    if (existingTab) {
      console.log('✅ 找到已存在的单个仓库标签页:', existingTab.id)
      await switchBrowserTab(existingTab.id)
      return
    }
  }

  // 处理普通 URL
  const currentTab = browserTabs.value.find(t => t.id === activeBrowserTabId.value)
  
  // 决定是在当前标签页打开还是新建标签页
  let shouldOpenInCurrentTab = false
  
  if (options.forceNewTab) {
    shouldOpenInCurrentTab = false
  } else if (options.forceCurrentTab) {
    shouldOpenInCurrentTab = true
  } else {
    // 默认逻辑：如果当前标签页是新标签页类型，在当前标签页打开
    // 注意：首页是固定的，不能替换，所以首页要在新标签页打开
    shouldOpenInCurrentTab = currentTab && (
      currentTab.routeType === 'new-tab' || 
      (!currentTab.url || currentTab.url === '')
    )
  }
  
  if (shouldOpenInCurrentTab && currentTab) {
    console.log('🌐 在当前标签页打开（动态切换类型）:', normalizedUrl)
    await openInCurrentTab(normalizedUrl, currentTab.id)
    
    // 更新 UI 状态（让输入框失去焦点）
    await nextTick()
    const urlInputElement = document.querySelector('.url-input')
    if (urlInputElement) {
      urlInputElement.blur()
    }
  } else {
    console.log('🌐 在新标签页打开:', normalizedUrl)
    await openNewTab(normalizedUrl)
  }
}

// 为指定标签页导航到 URL - 支持动态类型切换
const navigateToUrlForTab = async (tab, url) => {
  if (!tab) return
  
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) {
    console.log('⚠️ URL 为空，不执行导航')
    // 如果是新标签页（URL 为空），不执行任何操作，等待用户输入
    if (!tab.url || tab.url === '') {
      return
    }
    // 如果当前标签页有 URL，返回首页
    goHome()
    return
  }
  
  // 解析路由
  const route = parseRoute(normalizedUrl)
  
  // 如果路由类型发生变化，更新标签页路由（动态类型切换）
  // updateTabRoute 会设置 tab.initialUrl，Vue 响应式会自动触发 webview 加载
  if (tab.routeType !== route.type) {
    console.log('🔄 路由类型变化，更新标签页路由:', { 
      oldType: tab.routeType, 
      newType: route.type 
    })
    await openInCurrentTab(normalizedUrl, tab.id)
    // 更新 UI 状态
    await nextTick()
    const urlInputElement = document.querySelector('.url-input')
    if (urlInputElement) {
      urlInputElement.blur()
    }
    return // 重要：不要继续执行，否则会重复加载
  }
  
  // 路由类型未变化，需要检查是否真的需要导航
  const currentSrc = tab.url || ''
  const isBlankPage = !currentSrc || currentSrc === 'about:blank' || currentSrc === 'about:blank#blocked'

  // 如果当前已经加载了相同的 URL，不重复加载
  if (!isBlankPage && currentSrc === normalizedUrl) {
    console.log('✅ URL 未变化，跳过加载:', normalizedUrl)
    // 只更新 UI 状态
    tab.url = normalizedUrl
    if (tab.id === activeBrowserTabId.value) {
      currentUrl.value = normalizedUrl
      urlInput.value = normalizedUrl
    }
    return
  }
  
  // 更新标签页状态
  clearTabLoadError(tab)
  if (!tab.forwardHistory) tab.forwardHistory = []
  tab.forwardHistory = []
  tab.url = route.url
  tab.isLoading = true
  tab.webviewReady = true
  
  // 如果是当前标签页，更新 UI
  if (tab.id === activeBrowserTabId.value) {
    currentUrl.value = normalizedUrl
    urlInput.value = normalizedUrl
  }
  
  if (isWebContentsViewTab(tab)) {
    await ensureWebContentsViewTab(tab, normalizedUrl)
    if (tab.id === activeBrowserTabId.value) {
      await activateWebContentsViewTab(tab)
    }
    await window.electronAPI?.webTabNavigate?.({
      tabId: getWebContentsViewTabId(tab),
      url: normalizedUrl
    })
    tab.webviewSrc = normalizedUrl
    tab.initialUrl = normalizedUrl
  } else {
    const webview = getWebviewForTab(tab.id)
    if (!webview || !tab.webviewReady) {
      console.log('⏳ 通过 initialUrl 触发加载:', normalizedUrl)
      tab.initialUrl = normalizedUrl
      tab.webviewSrc = normalizedUrl
      await nextTick()
      const urlInputElement = document.querySelector('.url-input')
      if (urlInputElement) {
        urlInputElement.blur()
      }
      return
    }

    console.log('🔄 直接设置 webview.src:', normalizedUrl)
    try {
      webview.src = normalizedUrl
      tab.webviewSrc = normalizedUrl
    } catch (error) {
      console.error('❌ 设置 webview src 失败:', error)
    }
  }
  
  // 更新 UI 状态
  await nextTick()
  const urlInputElement = document.querySelector('.url-input')
  if (urlInputElement) {
    urlInputElement.blur()
  }
}

// 处理地址栏 Enter 键
const handleUrlInputEnter = async () => {
  if (!currentTab.value) return
  
  const inputUrl = urlInput.value.trim()
  
  // 如果输入框为空
  if (!inputUrl) {
    // 如果是 webview 标签页，重新加载
    if (currentTab.value.routeType === 'webview') {
      console.log('🔄 输入框为空，重新加载当前页面')
      if (browserContentAdapter.reload(currentTab.value)) {
        return
      }
    } else {
      // 功能性页面，重新加载收藏
      loadFavorites()
    }
    return
  }
  
  const normalizedInputUrl = normalizeUrl(inputUrl)
  const routeType = currentTab.value.routeType
  
  // 新标签页或功能性页面：在当前标签内加载网页
  if (routeType === 'new-tab' || routeType === 'favorites-manager' ||
      routeType === 'password-manager' || routeType === 'remote-repo' ||
      routeType === 'clone-directory' || routeType === 'single-project') {
    console.log('📄 在当前标签内加载:', normalizedInputUrl, 'routeType:', routeType)
    await navigateToUrl(normalizedInputUrl, { forceCurrentTab: true })
    return
  }
  
  // webview 标签页
  const currentNormalizedUrl = normalizeUrl(currentTab.value.url || currentUrl.value)
  
  // 如果输入框的值和当前 URL 相同（规范化后），则重新加载
  if (normalizedInputUrl && normalizedInputUrl === currentNormalizedUrl) {
    console.log('🔄 地址未变化，重新加载当前页面')
    if (browserContentAdapter.reload(currentTab.value)) {
      return
    }
  } else {
    // 在当前 webview 标签页导航到新 URL
    console.log('📄 在当前 webview 标签页打开:', normalizedInputUrl)
    await navigateToUrl(normalizedInputUrl, { forceCurrentTab: true })
  }
}

// 导航到 URL（使用当前标签页）
const goBack = async () => {
  if (!currentTab.value) return
  clearTabLoadError(currentTab.value)
  
  // 如果当前是新标签页，从历史记录返回
  if (currentTab.value.routeType === 'new-tab') {
    if (currentTab.value.history && currentTab.value.history.length > 0) {
      const previousUrl = currentTab.value.history.pop()
      console.log('🔄 从新标签页历史记录返回:', previousUrl)
      if (!currentTab.value.forwardHistory) currentTab.value.forwardHistory = []
      if (currentTab.value.url) {
        currentTab.value.forwardHistory.push(currentTab.value.url)
      }
      
      // 导航到之前的页面
      await navigateToUrl(previousUrl, { forceCurrentTab: true })
      
      // 更新返回按钮状态
      currentTab.value.canGoBack = currentTab.value.history.length > 0
      return
    }
    console.log('🔄 新标签页没有历史记录')
    return
  }
  
  // 尝试使用 webview 的返回功能
  if (browserContentAdapter.goBack(currentTab.value) && canGoBack.value) {
    return
  }
  
  // 如果 webview 不能返回，检查标签页历史记录
  if (currentTab.value.history && currentTab.value.history.length > 0) {
    const previousUrl = currentTab.value.history.pop()
    console.log('🔄 从标签页历史记录返回:', previousUrl)
    if (!currentTab.value.forwardHistory) currentTab.value.forwardHistory = []
    if (currentTab.value.url) {
      currentTab.value.forwardHistory.push(currentTab.value.url)
    }
    
    // 导航到之前的页面
    await navigateToUrl(previousUrl, { forceCurrentTab: true })
    
    // 更新返回按钮状态
    currentTab.value.canGoBack = currentTab.value.history.length > 0
      return
      }
  
  // 如果没有任何历史记录，回到新标签页状态
  console.log('🔄 无法返回，恢复为新标签页')
                  goHome()
                }

const goForward = async () => {
  if (!currentTab.value) return
  clearTabLoadError(currentTab.value)
  if (browserContentAdapter.goForward(currentTab.value) && canGoForward.value) {
    return
  }
  if (currentTab.value.forwardHistory && currentTab.value.forwardHistory.length > 0) {
    const nextUrl = currentTab.value.forwardHistory.pop()
    if (!currentTab.value.history) currentTab.value.history = []
    if (currentTab.value.url) {
      currentTab.value.history.push(currentTab.value.url)
    }
    await navigateToUrl(nextUrl, { forceCurrentTab: true })
  }
}

// 刷新当前活动标签页
const refresh = () => {
  if (!activeBrowserTabId.value) {
    console.log('⚠️ 没有活动标签页，无法刷新')
    return
  }
  
  const currentTab = browserTabs.value.find(t => t.id === activeBrowserTabId.value)
  if (!currentTab) {
    console.log('⚠️ 找不到当前标签页，无法刷新')
    return
  }
  clearTabLoadError(currentTab)
  
  console.log('🔄 刷新当前标签页:', currentTab.routeType || 'webview', currentTab.id)
  
  // 根据标签类型调用相应的刷新方法
  if (currentTab.routeType === 'new-tab') {
    // 新标签页：刷新收藏列表
    loadFavorites()
    console.log('✅ 新标签页刷新完成')
  } else if (currentTab.routeType === 'remote-repo') {
    // 远端仓库页面：通过 IPC 发送刷新事件
    console.log('🔄 远端仓库页面刷新（通过 IPC）')
    // 设置刷新状态
    currentTab.isRefreshing = true
    if (window.electronAPI && window.electronAPI.sendRefreshOnFocus) {
      window.electronAPI.sendRefreshOnFocus()
    }
  } else if (currentTab.routeType === 'clone-directory' || currentTab.routeType === 'single-project') {
    // 克隆目录/单个仓库页面：通过 IPC 发送刷新事件
    console.log('🔄 Git 页面刷新（通过 IPC）')
    // 设置刷新状态
    currentTab.isRefreshing = true
    if (window.electronAPI && window.electronAPI.sendRefreshOnFocus) {
      window.electronAPI.sendRefreshOnFocus()
    }
  } else if (currentTab.routeType === 'webview') {
    // 普通网页：直接刷新 webview
    if (browserContentAdapter.reload(currentTab)) {
      console.log('✅ 网页刷新完成')
    } else {
      console.log('⚠️ 无法获取 webview 实例，尝试重新导航当前 URL')
      if (currentTab.url) {
        navigateToUrlForTab(currentTab, currentTab.url)
      }
    }
  } else {
    console.log('⚠️ 未知的标签类型，无法刷新:', currentTab.type)
  }
}

// 停止刷新状态（供子组件调用）
const stopRefreshing = (tabId) => {
  const tab = browserTabs.value.find(t => t.id === (tabId || activeBrowserTabId.value))
  if (tab) {
    tab.isRefreshing = false
    console.log('✅ 刷新状态已重置:', tab.id)
  }
}

const handleRefreshCurrentTabMessage = () => {
  refresh()
}

const goHome = async () => {
  // 将当前标签页恢复为新标签页状态
  if (!currentTab.value) {
    // 如果没有当前标签页，创建一个新的
    await createNewBrowserTab()
    return
  }
  
  console.log('🏠 将当前标签页恢复为新标签页状态')
  
  // 保存当前 URL 到历史记录（如果是有效的 URL）
  const currentUrlToSave = currentUrl.value || currentTab.value.url
  if (currentUrlToSave && 
      currentUrlToSave !== '' && 
      currentUrlToSave !== 'about:blank' &&
      !currentUrlToSave.startsWith('about:')) {
    if (!currentTab.value.history) {
      currentTab.value.history = []
    }
    // 避免重复添加
    if (currentTab.value.history[currentTab.value.history.length - 1] !== currentUrlToSave) {
      currentTab.value.history.push(currentUrlToSave)
      console.log('📝 保存到历史记录:', currentUrlToSave)
    }
  }
  
  // 将当前标签页设置为新标签页状态
  currentTab.value.url = ''
  currentTab.value.title = '新标签页'
  currentTab.value.routeType = 'new-tab'
  currentTab.value.routeConfig = routeConfig['new-tab'] || { showWebview: false }
  currentTab.value.routeProps = {}
  currentTab.value.isLoading = false
  currentTab.value.webviewSrc = 'about:blank'
  currentTab.value.initialUrl = ''
  currentTab.value.canGoBack = currentTab.value.history && currentTab.value.history.length > 0
  currentTab.value.canGoForward = false
  currentTab.value.forwardHistory = []
  clearTabLoadError(currentTab.value)
  
  currentUrl.value = ''
  urlInput.value = ''
  showSuggestions.value = false
  syncLoadingProgressWithActiveTab()
}

// 处理 GitProject 组件的 navigate 事件
// 兼容旧目录容器页的 navigate 事件
const handleGitProjectNavigate = async (type, title, props) => {
  console.log('🔄 Browser: handleGitProjectNavigate 被调用:', { type, title, props })
  
  if (type === 'browser' && props && props.initialUrl) {
    console.log('🌐 Browser: 从 GitProject 打开 URL:', props.initialUrl)
    // GitLab 打开按钮应该总是新建标签页
    await navigateToUrl(props.initialUrl, { forceNewTab: true })
    } else {
    console.log('⚠️ Browser: 未知的 navigate 类型或缺少 initialUrl:', { type, props })
  }
}

// navigateToFavorite 现在直接调用统一的 navigateToUrl
const navigateToFavorite = async (url) => {
  console.log('🔗 navigateToFavorite 被调用，URL:', url)
  await navigateToUrl(url)
}

// WebView 事件处理（接收 tabId 参数）
const onLoadStart = (event, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (tab) {
    tab.isLoading = true
    tab.isCrashed = false
    clearTabLoadError(tab)
  }
  // 如果是当前标签页，更新 UI
  if (tabId === activeBrowserTabId.value) {
    startLoadingProgress()
  }
}

const onLoadStop = async (event, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (tab) {
    tab.isLoading = false
  }
  // 如果是当前标签页，更新导航状态
  if (tabId === activeBrowserTabId.value) {
    finishLoadingProgress()
    updateNavigationState()
  }
}

const onNavigate = (event, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (!tab) return
  tab.isCrashed = false
  clearTabLoadError(tab)
  
  // 检查是否是重复的导航事件（同一个 URL）
  if (tab.url === event.url) {
    console.log('⏭️ onNavigate: 重复的导航事件，跳过:', { tabId, url: event.url })
    return
  }
  
  console.log('🔄 onNavigate 事件:', { tabId, url: event.url, isCurrentTab: tabId === activeBrowserTabId.value })
  
  // 只更新 tab.url（用于 UI 显示），不更新 initialUrl（避免触发 webview 重新加载）
  tab.url = event.url
  
  // 标记需要保存历史记录（等标题加载后再保存）
  if (event.url && !event.url.startsWith('about:')) {
    tab.needsSaveHistory = true
  }
  
  // 如果是当前标签页，更新 UI 状态
  if (tabId === activeBrowserTabId.value) {
      // 如果导航到 about:blank 或 about:blank#blocked，不更新 UI（避免显示 about:blank）
      if (event.url === 'about:blank' || event.url === 'about:blank#blocked') {
        console.log('🔄 导航到空白页，不更新 UI:', event.url)
        // 如果 webview 被阻止了，尝试重新加载正确的 URL（限制重试次数）
        if (event.url === 'about:blank#blocked' && tab.url && tab.url.startsWith('http')) {
          // 初始化或增加重试计数
          tab.retryCount = (tab.retryCount || 0) + 1
          if (tab.retryCount <= 3) {
            console.log(`⚠️ Webview 被阻止，尝试重新加载 (${tab.retryCount}/3):`, tab.url)
            setTimeout(() => {
              if (isWebContentsViewTab(tab)) {
                window.electronAPI?.webTabNavigate?.({
                  tabId: getWebContentsViewTabId(tab),
                  url: tab.url
                })
                tab.webviewSrc = tab.url
              } else {
                try {
                  const webview = getWebviewForTab(tabId)
                  if (webview) {
                    webview.src = tab.url
                    tab.webviewSrc = tab.url
                  }
                } catch (e) {
                  console.warn('重新加载失败:', e)
                }
              }
            }, 100)
          } else {
            console.warn('⚠️ 重试次数已达上限，停止重新加载:', tab.url)
          }
        }
      return
    }
    
    // 成功导航，重置重试计数
    tab.retryCount = 0
    
    // 更新 currentUrl，这样收藏状态会自动更新
    currentUrl.value = event.url
    urlInput.value = event.url
    
    updateNavigationState()
  }
}

const onNavigateInPage = (event, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (!tab) return
  tab.isCrashed = false
  clearTabLoadError(tab)
  
  // 更新标签页的 URL（不更新 webviewSrc，避免触发 Vue 响应式更新导致重新加载）
  tab.url = event.url
  // 注意：不更新 tab.webviewSrc，因为这是页面内导航，webview 已经导航到了这个 URL
  
  // 如果是当前标签页，更新 UI 状态
  if (tabId === activeBrowserTabId.value) {
    currentUrl.value = event.url
    urlInput.value = event.url
    updateNavigationState()
  }
}

// 从 WebView 组件接收标题更新
const onTitleUpdatedFromWebView = (title, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (tab) {
    console.log('📝 标题更新:', { tabId, title, type: tab.type, needsSaveHistory: tab.needsSaveHistory, url: tab.url })
    
    if (tab.routeType === 'webview') {
      tab.title = title
      
      // 如果需要保存历史记录，在标题更新后保存
      if (tab.needsSaveHistory && tab.url && !tab.url.startsWith('about:')) {
        console.log('📜 触发保存历史记录:', { url: tab.url, title, favicon: tab.favicon })
        tab.needsSaveHistory = false
        addToHistory(tab.url, title, tab.favicon)
      }
    }
  }
}

// 从 WebView 组件接收 favicon 更新
const onFaviconUpdated = (favicon, tabId) => {
  console.log('📥 Browser.vue: 收到 favicon 更新事件, favicon:', favicon, 'tabId:', tabId)
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (tab) {
    if (tab.type) {
      console.log('⏸️ 特殊页面，不更新 favicon, type:', tab.type)
      return
    }
    console.log('✅ Browser.vue: 更新标签页 favicon, tabId:', tabId, 'favicon:', favicon)
    tab.favicon = favicon
    tab.faviconError = false
    
    // 同时更新历史记录中的 favicon（如果已保存）
    if (tab.url && !tab.url.startsWith('about:') && favicon) {
      // 查找并更新历史记录中的 favicon
      const historyItem = browsingHistory.value.find(item => item.url === tab.url)
      if (historyItem && !historyItem.favicon) {
        historyItem.favicon = favicon
        console.log('📜 更新历史记录 favicon:', tab.url)
        // 异步保存（不阻塞）
        const { saveHistory } = useBrowsingHistory()
        saveHistory()
      }
    }
  } else {
    console.warn('⚠️ Browser.vue: 未找到标签页, tabId:', tabId)
  }
}

// 从 WebView 组件接收导航状态变化
const onNavigationStateChanged = (state, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (tab) {
    tab.canGoBack = state.canGoBack
    tab.canGoForward = state.canGoForward
  }
}

const onNewWindow = async (event, tabId) => {
  // 阻止默认行为
  if (event.preventDefault) {
    event.preventDefault()
  }
  
  // 在新标签页中打开链接
  const url = event.url
  if (url && url.startsWith('http')) {
    console.log('🔗 拦截新窗口请求，在新标签页打开:', url)
    await openNewTab(url)
  }
}

// 打开当前活动 webview 的 DevTools
const openActiveWebviewDevTools = () => {
  const activeTab = browserTabs.value.find(t => t.id === activeBrowserTabId.value)
  if (!activeTab || activeTab.routeType !== 'webview') {
    console.log('🔧 当前标签页不是 webview，无法打开 DevTools')
    return
  }
  
  // 查找对应的 webview 元素
  const webview = document.querySelector(`webview[data-tab-id="${activeTab.id}"]`)
  if (webview) {
    try {
      // webview 的 openDevTools 不支持 options，只能以独立窗口方式打开
      webview.openDevTools()
      console.log('🔧 打开 webview DevTools, tabId:', activeTab.id)
    } catch (err) {
      console.error('无法打开 webview DevTools:', err)
    }
  } else {
    console.warn('🔧 未找到 webview 元素')
  }
}

const onDomReady = async (event, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (!tab) return
  
  // 标记 webview 已准备好
    tab.webviewReady = true
  tab.isCrashed = false
  tab.initialLoadDone = true
    
  // DOM ready 时就结束 loading（不等待所有资源加载完成）
  tab.isLoading = false
    
  // 更新导航状态
      if (tabId === activeBrowserTabId.value) {
        updateNavigationState()
  }
}

const onLoadFail = (event, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  const errorDesc = String(event?.errorDescription || '')
  const isAbort = Number(event?.errorCode) === -3 || errorDesc.toUpperCase().includes('ERR_ABORTED')
  if (tab) {
    tab.isLoading = false
    const isMainFrame = event?.isMainFrame !== false
    if (isMainFrame && !isAbort) {
      tab.loadError = {
        errorCode: event?.errorCode ?? 'unknown',
        errorDescription: event?.errorDescription || '页面加载失败',
        validatedURL: event?.validatedURL || tab.url || ''
      }
    }
  }
  if (tabId === activeBrowserTabId.value) {
    finishLoadingProgress()
  }
  if (isAbort) {
    return
  }
  console.error('❌ 页面加载失败:', {
    tabId,
    errorCode: event.errorCode,
    errorDescription: event.errorDescription,
    validatedURL: event.validatedURL,
    isMainFrame: event.isMainFrame
  })
  console.error('❌ Webview 加载失败:', {
    errorCode: event.errorCode,
    errorDescription: event.errorDescription,
    validatedURL: event.validatedURL,
    isMainFrame: event.isMainFrame
  })
  // isLoading 是 computed，会自动从 currentTab 同步
}

const updateNavigationState = () => {
  if (!browserContentAdapter) return
  browserContentAdapter.syncNavigationState(currentTab.value)
}

// 收藏功能已移至 useFavorites composable

const toggleFavorite = async () => {
  // 不支持收藏的页面直接返回
  if (!canFavorite.value) return

  if (isCurrentUrlFavorited.value) {
    // 取消收藏
    const favorite = favorites.value.find(fav => fav.url === currentUrl.value)
    if (favorite) {
      await removeFavorite(favorite.id)
    }
  } else {
    // 添加收藏
    await addFavorite()
  }
}

// 获取网站默认 favicon URL（不依赖 webview）
const getDefaultFaviconUrl = (url) => {
  try {
    if (!url || !url.startsWith('http')) {
      return null
    }
    const urlObj = new URL(url)
    return `${urlObj.origin}/favicon.ico`
  } catch (error) {
    return null
  }
}

// 添加收藏（需要获取 favicon）
const addFavorite = async () => {
  try {
    // 如果没有标题，使用"空白页"作为标题
    let title = pageTitle.value || currentUrl.value
    if (!title || title === 'about:blank' || title === '') {
      title = '空白页'
    }
    const url = currentUrl.value
    
    // 使用默认 favicon URL，不依赖 webview
    const icon = getDefaultFaviconUrl(url)
    
    await addFavoriteToStore(title, url, icon)
  } catch (error) {
    console.error('添加收藏失败:', error)
  }
}



// 暴露清除函数到全局，方便调试
if (typeof window !== 'undefined') {
  window.clearAllPasswords = clearAllPasswords
  window.deletePasswordByDomain = deletePasswordByDomain
}


// 存储每个标签页的 webview 组件引用（通过 webview-ready 事件设置）
const webviewRefs = ref({})

// 获取指定标签页的 webview 实例
const getWebviewForTab = (tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (!tab) return null
  
  // 从 tab.webview 获取（onWebviewReady 设置的）
  return tab.webview || null
}

// WebView 组件准备就绪时的回调
const onWebviewReady = (webview, tabId) => {
  const tab = browserTabs.value.find(t => t.id === tabId)
  if (tab) {
    tab.webview = webview
  }
}

// 获取当前标签页的 webview
const getCurrentWebview = () => {
  if (!currentTab.value) return null
  return getWebviewForTab(currentTab.value.id)
}

browserContentAdapter = createBrowserContentAdapter({
  getCurrentTab: () => currentTab.value,
  getTabById: (tabId) => browserTabs.value.find(t => t.id === tabId) || null,
  getCurrentWebview,
  getWebviewForTab,
  navigateToUrlForTab: (...args) => navigateToUrlForTab(...args)
})

function getWebContentsViewBounds() {
  const el = browserContentRef.value
  if (!el) return null

  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height))
  }
}

function syncWebContentsViewBounds() {
  if (!window.electronAPI?.webTabSetBounds) return
  const bounds = getWebContentsViewBounds()
  if (!bounds) return
  window.electronAPI.webTabSetBounds({ bounds })
}

function isWebContentsViewTab(tab) {
  if (!tab) return false
  return tab.routeType === 'webview' && (tab.contentHost || 'webcontentsview') === 'webcontentsview'
}

function getWebContentsViewTabId(tab) {
  if (!tab) return null
  return `browser-web-${tab.id}`
}

function resolveSessionPartition({ tabId, isPrivate = false } = {}) {
  if (isPrivate && tabId) {
    return `temp:browser-web-${tabId}`
  }
  return 'persist:main'
}

async function ensureWebContentsViewTab(tab, targetUrl = '') {
  if (!isWebContentsViewTab(tab) || !window.electronAPI?.webTabCreate) return false

  const tabId = getWebContentsViewTabId(tab)
  const url = normalizeUrl(targetUrl || tab.url || tab.initialUrl || 'about:blank')
  const partition = tab.sessionPartition || resolveSessionPartition({ tabId: tab.id, isPrivate: tab.isPrivate })
  tab.sessionPartition = partition
  if (!tab.__webContentsCreated) {
    const result = await window.electronAPI.webTabCreate({
      tabId,
      url,
      isPrivate: Boolean(tab.isPrivate),
      partition
    })
    if (result?.success) {
      tab.__webContentsCreated = true
      tab.sessionPartition = result.partition || partition
    }
    return !!result?.success
  }
  return true
}

async function activateWebContentsViewTab(tab) {
  if (!isWebContentsViewTab(tab) || !window.electronAPI?.webTabActivate) return
  await ensureWebContentsViewTab(tab)
  syncWebContentsViewBounds()
  const bounds = getWebContentsViewBounds()
  await window.electronAPI.webTabActivate({
    tabId: getWebContentsViewTabId(tab),
    bounds
  })
}

async function hideAllWebContentsViewTabs() {
  if (!window.electronAPI?.webTabHideAll) return
  await window.electronAPI.webTabHideAll()
}

async function destroyWebContentsViewTab(tab) {
  if (!tab || !tab.__webContentsCreated || !window.electronAPI?.webTabDestroy) return
  await window.electronAPI.webTabDestroy({ tabId: getWebContentsViewTabId(tab) })
  tab.__webContentsCreated = false
}

async function syncActiveContentHost() {
  const tab = currentTab.value
  if (!tab) return
  if (isWebContentsViewTab(tab)) {
    if (tab.lifecyclePhase === 'discarded') {
      await restoreWebContentsViewTab(tab, { activate: true })
      return
    }
    await activateWebContentsViewTab(tab)
    return
  }
  await hideAllWebContentsViewTabs()
}

function bindWebContentsViewEvents() {
  if (!window.electronAPI?.onWebTabStateChanged) return

  window.electronAPI.onWebTabStateChanged((payload) => {
    const tab = browserTabs.value.find(t => getWebContentsViewTabId(t) === payload?.tabId)
    if (!tab) return

    const prevLoading = !!tab.isLoading
    let urlChanged = false
    if (typeof payload.isLoading === 'boolean') {
      tab.isLoading = payload.isLoading
      if (tab.id === activeBrowserTabId.value) {
        if (payload.isLoading && !prevLoading) startLoadingProgress()
        if (!payload.isLoading && prevLoading) finishLoadingProgress()
      }
    }
    if (typeof payload.isCrashed === 'boolean') {
      tab.isCrashed = payload.isCrashed
    }
    if (typeof payload.url === 'string' && payload.url) {
      urlChanged = tab.url !== payload.url
      tab.url = payload.url
      if (tab.id === activeBrowserTabId.value) {
        currentUrl.value = payload.url
        urlInput.value = payload.url
      }
      if (!payload.url.startsWith('about:')) {
        tab.needsSaveHistory = true
      }
    }
    if (typeof payload.canGoBack === 'boolean') tab.canGoBack = payload.canGoBack
    if (typeof payload.canGoForward === 'boolean') tab.canGoForward = payload.canGoForward

    if (tab.id === activeBrowserTabId.value && (urlChanged || (!tab.isLoading && prevLoading))) {
      runPasswordAutomationForTab(tab).catch((error) => {
        console.warn('密码自动化执行失败:', error)
      })
    }
  })

  window.electronAPI.onWebTabTitleUpdated(({ tabId, title }) => {
    const tab = browserTabs.value.find(t => getWebContentsViewTabId(t) === tabId)
    if (!tab) return
    onTitleUpdatedFromWebView(title, tab.id)
  })

  window.electronAPI.onWebTabFaviconUpdated(({ tabId, favicon }) => {
    const tab = browserTabs.value.find(t => getWebContentsViewTabId(t) === tabId)
    if (!tab) return
    onFaviconUpdated(favicon, tab.id)
  })

  window.electronAPI.onWebTabLoadFailed((payload) => {
    const tab = browserTabs.value.find(t => getWebContentsViewTabId(t) === payload?.tabId)
    if (!tab) return
    onLoadFail({
      errorCode: payload.errorCode,
      errorDescription: payload.errorDescription,
      validatedURL: payload.url,
      isMainFrame: true
    }, tab.id)
  })

  window.electronAPI.onWebTabLifecycleChanged?.((payload) => {
    const tab = browserTabs.value.find(t => getWebContentsViewTabId(t) === payload?.tabId)
    if (!tab) return
    if (typeof payload.phase === 'string' && payload.phase) {
      tab.lifecyclePhase = payload.phase
      if (payload.phase === 'discarded') {
        const webTabId = getWebContentsViewTabId(tab)
        lastFilledUrlByTabId.delete(webTabId)
        filledPasswordByTabId.delete(webTabId)
        passwordCapturedSignatures.delete(webTabId)
        tab.__webContentsCreated = false
        if (tab.id === activeBrowserTabId.value) {
          restoreWebContentsViewTab(tab, { activate: true }).catch((error) => {
            console.warn('活动标签页自动恢复失败:', error)
          })
        }
      }
      if (payload.phase !== 'discarded' && tab.id === activeBrowserTabId.value) {
        syncPermissionPromptForActiveTab()
      }
    }
  })

  window.electronAPI.onWebDownloadStateChanged?.((payload) => {
    if (!payload?.id) return
    const mappedState = payload.state === 'progress' ? 'progressing' : payload.state
    upsertDownloadItem({
      ...payload,
      state: mappedState,
      retryable: mappedState === 'interrupted'
    })

    if (mappedState === 'interrupted') {
      markDownloadRetryable(payload.id, true)
    }
  })

  window.electronAPI.onBrowserPermissionRequested?.((payload) => {
    if (!payload?.requestId) return

    const activeTabId = getActiveWebContentsViewTabId()
    if (!payload.tabId || payload.tabId !== activeTabId) {
      denyPermissionRequests([payload])
      return
    }

    enqueuePermissionPrompt(payload)
  })

  window.electronAPI.onWebTabPasswordCaptured?.((payload) => {
    handleWebTabPasswordCaptured(payload).catch((error) => {
      console.warn('处理密码捕获事件失败:', error)
    })
  })
}

// 浏览器标签页管理
// 获取特殊页面的标题和图标
// 创建浏览器标签页 - 使用路由系统
const createBrowserTab = (url = '', title = '', options = {}) => {
  // 如果 URL 为空，创建新标签页
  const finalUrl = url || ''
  const isPrivate = Boolean(options.isPrivate)
  const tabId = nextBrowserTabId++
  
  // 解析路由（使用最终 URL）
  const route = parseRoute(finalUrl)
  // 计算标题：优先使用传入的 title，然后是路由解析的 title，最后是配置中的 title（需要处理函数类型）
  let finalTitle = title || route.title
  if (!finalTitle) {
    const configTitle = route.config.title
    finalTitle = typeof configTitle === 'function' ? configTitle(finalUrl) : (configTitle || '新标签页')
  }
  
  // 判断是否需要保存历史记录（webview 类型且是 http/https URL）
  const shouldSaveHistory = route.type === 'webview' && route.url && /^https?:\/\//i.test(route.url)
  console.log('🆕 创建标签页, shouldSaveHistory:', shouldSaveHistory, 'routeType:', route.type, 'url:', route.url)
  
  const tab = {
    id: tabId,
    url: route.url,
    initialUrl: route.url, // 初始 URL，用于 webview src 绑定，创建后不变
    title: finalTitle,
    favicon: null,
    faviconError: false,
    webview: null,
    webviewReady: false,
    initialLoadDone: false,
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    isCrashed: false,
    // 路由信息
    routeType: route.type,
    routeConfig: route.config,
    routeProps: route.props || {},
    contentKind: route.config.showWebview ? 'web' : 'builtin',
    contentHost: route.config.showWebview ? 'webcontentsview' : 'builtin',
    isPrivate,
    sessionPartition: resolveSessionPartition({ tabId, isPrivate }),
    lifecyclePhase: route.config.showWebview ? 'warm' : '',
    history: [], // 历史记录（用于返回功能）
    forwardHistory: [], // 前进栈（用于返回后前进）
    needsSaveHistory: shouldSaveHistory, // 是否需要保存到浏览历史
    loadError: null
  }
  
  browserTabs.value.push(tab)
  
  // 初始化新标签的显示顺序（放在最后）
  const maxOrder = Math.max(...Object.values(tabOrder.value), browserTabs.value.length - 1)
  tabOrder.value[tab.id] = maxOrder + 1
  
  console.log('✅ 创建浏览器标签页:', { 
    id: tab.id, 
    url: tab.url, 
    routeType: tab.routeType, 
    title: tab.title,
    showWebview: tab.routeConfig.showWebview
  })
  
  return tab
}

// 更新标签页路由 - 实现动态类型切换
const updateTabRoute = (tab, newUrl) => {
  if (!tab) return
  
  const oldRouteType = tab.routeType
  const route = parseRoute(newUrl)
  
  console.log('🔄 更新标签页路由:', { 
    tabId: tab.id, 
    oldRouteType: tab.routeType, 
    newRouteType: route.type,
    newUrl 
  })
  
  // 更新路由信息
  tab.routeType = route.type
  tab.routeConfig = route.config
  tab.routeProps = route.props || {}
  tab.contentKind = route.config.showWebview ? 'web' : 'builtin'
  tab.contentHost = route.config.showWebview ? 'webcontentsview' : 'builtin'
  tab.url = route.url
  clearTabLoadError(tab)
  tab.forwardHistory = []
  
  // 更新标题（处理函数类型的 title）
  if (route.title) {
    tab.title = route.title
  } else if (route.config.title) {
    const configTitle = route.config.title
    tab.title = typeof configTitle === 'function' ? configTitle(newUrl) : configTitle
  }
  
  // 更新 webview 相关配置
  if (route.config.showWebview) {
    // 如果新路由需要显示 webview
    tab.webviewSrc = newUrl || 'about:blank'
    tab.initialUrl = newUrl || 'about:blank' // 重要：更新 initialUrl，getWebViewSrc 使用它
    tab.pendingUrl = newUrl || ''
    tab.isLoading = true // 开始加载
    
    // 设置需要保存历史记录（http/https URL）
    if (newUrl && /^https?:\/\//i.test(newUrl)) {
      tab.needsSaveHistory = true
    }
  } else {
    // 如果新路由不需要显示 webview，隐藏它
    tab.webviewSrc = 'about:blank'
    tab.initialUrl = 'about:blank'
    tab.pendingUrl = ''
    tab.needsSaveHistory = false
    if (oldRouteType === 'webview') {
      destroyWebContentsViewTab(tab)
    }
  }
  
  // 如果是当前标签页，更新 UI
  if (tab.id === activeBrowserTabId.value) {
    currentUrl.value = route.url
    if (route.type === 'new-tab') {
      urlInput.value = ''
    } else if (route.type === 'webview' && route.url && !route.url.startsWith('about:')) {
      // 只有有效的 URL 才显示在地址栏
      urlInput.value = route.url
    } else {
      urlInput.value = route.url
    }
  }
  
  return true // 返回 true 表示已更新
}

// ==================== 标签拖拽排序 ====================

// 获取标签的显示顺序
const getTabOrder = (tabId) => {
  // 如果有自定义顺序，使用自定义顺序
  if (tabOrder.value[tabId] !== undefined) {
    return tabOrder.value[tabId]
  }
  // 否则使用数组中的原始顺序
  const index = browserTabs.value.findIndex(t => t.id === tabId)
  return index >= 0 ? index : 9999
}

// 判断标签是否应该隐藏右侧分隔线（基于视觉顺序）
const shouldHideSeparator = (tabId) => {
  const currentOrder = getTabOrder(tabId)
  const activeOrder = getTabOrder(activeBrowserTabId.value)
  
  // 获取所有标签按视觉顺序排列
  const sortedTabs = [...browserTabs.value].sort((a, b) => getTabOrder(a.id) - getTabOrder(b.id))
  const visualIndex = sortedTabs.findIndex(t => t.id === tabId)
  
  // 当前标签是活动标签 - 隐藏分隔线
  if (tabId === activeBrowserTabId.value) {
    return true
  }
  
  // 当前标签是视觉上最后一个标签 - 隐藏分隔线
  if (visualIndex === sortedTabs.length - 1) {
    return true
  }
  
  // 当前标签的下一个标签（视觉顺序）是活动标签 - 隐藏分隔线
  if (visualIndex < sortedTabs.length - 1) {
    const nextTab = sortedTabs[visualIndex + 1]
    if (nextTab && nextTab.id === activeBrowserTabId.value) {
      return true
    }
  }
  
  return false
}

// 初始化/更新所有标签的顺序
const updateAllTabOrders = () => {
  const newOrder = {}
  browserTabs.value.forEach((tab, index) => {
    newOrder[tab.id] = tabOrder.value[tab.id] !== undefined ? tabOrder.value[tab.id] : index
  })
  tabOrder.value = newOrder
}

// 自定义拖拽相关状态
let dragClone = null
let dragStartX = 0
let dragOffsetX = 0
let tabBarRect = null

// 鼠标按下开始拖拽
const onTabMouseDown = (event, tab, index) => {
  // 只有一个标签时不能拖拽
  if (browserTabs.value.length <= 1) {
    return
  }
  
  // 只响应左键
  if (event.button !== 0) {
    return
  }
  
  // 如果点击的是关闭按钮，不启动拖拽
  if (event.target.closest('.browser-tab-close')) {
    return
  }
  
  // 保存原始元素引用（必须在事件处理函数中立即保存）
  const tabElement = event.currentTarget
  
  // 延迟启动拖拽，避免误触
  const startX = event.clientX
  const startY = event.clientY
  
  const onMouseMoveCheck = (e) => {
    const dx = Math.abs(e.clientX - startX)
    const dy = Math.abs(e.clientY - startY)
    
    // 移动超过 5px 才开始拖拽
    if (dx > 5 || dy > 5) {
      document.removeEventListener('mousemove', onMouseMoveCheck)
      document.removeEventListener('mouseup', onMouseUpCancel)
      startDrag(e, tab, tabElement) // 使用保存的元素引用
    }
  }
  
  const onMouseUpCancel = () => {
    document.removeEventListener('mousemove', onMouseMoveCheck)
    document.removeEventListener('mouseup', onMouseUpCancel)
            }
  
  document.addEventListener('mousemove', onMouseMoveCheck)
  document.addEventListener('mouseup', onMouseUpCancel)
  }
  
// 当前拖拽的原始元素
let dragSourceElement = null

// 开始拖拽
const startDrag = (event, tab, tabElement) => {
  draggingTabId.value = tab.id
  draggingTabIndex = getTabOrder(tab.id)
  dragSourceElement = tabElement
  
  if (!tabElement) {
    console.error('Tab element not found')
    return
}

  // 获取标签栏容器
  const tabBar = tabElement.closest('.browser-tabs-list')
  if (!tabBar) {
    console.error('Tab bar not found')
    return
  }
  
  tabBarRect = tabBar.getBoundingClientRect()
  const tabRect = tabElement.getBoundingClientRect()
  
  // 记录起始位置和偏移
  dragStartX = event.clientX
  dragOffsetX = event.clientX - tabRect.left
  
  // 创建拖拽克隆元素
  dragClone = tabElement.cloneNode(true)
  dragClone.classList.add('drag-clone')
  dragClone.style.cssText = `
    position: fixed;
    top: ${tabRect.top}px;
    left: ${tabRect.left}px;
    width: ${tabRect.width}px;
    height: ${tabRect.height}px;
    z-index: 10000;
    pointer-events: none;
    opacity: 0.95;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    background: #3c3c3c;
    border-radius: 6px 6px 0 0;
    transition: none;
  `
  document.body.appendChild(dragClone)
  
  // 原标签变透明
  tabElement.style.opacity = '0.3'
  
  // 添加全局事件监听
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  
  // 阻止选中文本
  event.preventDefault()
}

// 鼠标移动
const onMouseMove = (event) => {
  if (!dragClone || !tabBarRect) return
  
  // 计算新位置（限制在标签栏水平范围内）
  let newLeft = event.clientX - dragOffsetX
  newLeft = Math.max(tabBarRect.left, Math.min(newLeft, tabBarRect.right - dragClone.offsetWidth))
  
  dragClone.style.left = `${newLeft}px`
  
  // 检测悬停在哪个标签上
  const centerX = newLeft + dragClone.offsetWidth / 2
  let hoveredTabId = null
  
  // 遍历所有标签，检查哪个在悬停位置
  const allTabItems = document.querySelectorAll('.browser-tab-item[data-tab-id]')
  allTabItems.forEach((tabItem) => {
    if (tabItem === dragSourceElement) return
    
    const rect = tabItem.getBoundingClientRect()
    if (centerX >= rect.left && centerX <= rect.right) {
      const tabId = Number(tabItem.dataset.tabId)
      const tab = browserTabs.value.find(t => t.id === tabId)
      if (tab && tab.routeType !== 'home' && tabId !== draggingTabId.value) {
        hoveredTabId = tabId
      }
    }
  })
  
  dragOverTabId.value = hoveredTabId
}

// 鼠标释放
const onMouseUp = (event) => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  
  // 如果悬停在某个标签上，执行交换
  if (dragOverTabId.value !== null && draggingTabId.value !== null) {
    const fromOrder = getTabOrder(draggingTabId.value)
    const toOrder = getTabOrder(dragOverTabId.value)
    
    if (fromOrder !== toOrder) {
      const newOrder = { ...tabOrder.value }
      newOrder[draggingTabId.value] = toOrder
      newOrder[dragOverTabId.value] = fromOrder
      tabOrder.value = newOrder
      
      saveBrowserTabs()
    }
  }
  
  // 恢复原标签样式
  if (dragSourceElement) {
    dragSourceElement.style.opacity = '1'
    dragSourceElement = null
  }
  
  // 移除克隆元素
  if (dragClone) {
    dragClone.remove()
    dragClone = null
  }
  
  // 清除状态
  draggingTabId.value = null
  dragOverTabId.value = null
  draggingTabIndex = -1
  tabBarRect = null
}

// ==================== 标签拖拽排序结束 ====================

const switchBrowserTab = async (tabId) => {
  // 保存当前标签页的状态（只保存必要信息，不触发任何加载）
  if (currentTab.value && currentTab.value.routeType === 'webview') {
    const state = browserContentAdapter.captureWebTabState(currentTab.value)
    if (state) {
      if (state.url && state.url !== 'about:blank') {
        currentTab.value.webviewSrc = state.url
        currentTab.value.url = state.url
      }
      currentTab.value.canGoBack = !!state.canGoBack
      currentTab.value.canGoForward = !!state.canGoForward
    }
  }
  
  // 切换到新标签页（只更新 activeBrowserTabId，不触发 webview 加载）
  activeBrowserTabId.value = tabId
  // 等待下一个 tick，确保组件更新完成
  await nextTick()
  syncLoadingProgressWithActiveTab()
  await syncActiveContentHost()
  
  // 状态会通过 watch 自动同步（watch 中也不会触发重新加载）
}

const snapshotClosableTab = (tab) => {
  if (!tab) return null
  return {
    url: tab.url || '',
    title: tab.title || '',
    routeType: tab.routeType || 'new-tab',
    routeProps: { ...(tab.routeProps || {}) },
    isPrivate: Boolean(tab.isPrivate),
    sessionPartition: tab.sessionPartition || ''
  }
}

const restoreClosedBrowserTab = async () => {
  const snapshot = popClosedTab()
  if (!snapshot) return

  if (snapshot.routeType === 'new-tab' && !snapshot.url) {
    if (snapshot.isPrivate) {
      await createNewPrivateBrowserTab()
    } else {
      await createNewBrowserTab()
    }
    return
  }

  const tab = createBrowserTab(snapshot.url, snapshot.title, { isPrivate: snapshot.isPrivate })
  tab.sessionPartition = snapshot.sessionPartition || resolveSessionPartition({ tabId: tab.id, isPrivate: snapshot.isPrivate })
  if (snapshot.routeType && snapshot.routeType !== tab.routeType) {
    tab.routeType = snapshot.routeType
    tab.routeProps = { ...(snapshot.routeProps || {}) }
  }
  await switchBrowserTab(tab.id)
}


const closeBrowserTab = async (tabId) => {
  // 使用字符串比较避免类型不一致问题
  const tabIdStr = String(tabId)
  const index = browserTabs.value.findIndex(t => String(t.id) === tabIdStr)
  if (index === -1) {
    console.log('⚠️ 找不到要关闭的标签页:', tabId)
    return
  }
  
  const tab = browserTabs.value[index]
  if (isWebContentsViewTab(tab)) {
    const webTabId = getWebContentsViewTabId(tab)
    lastFilledUrlByTabId.delete(webTabId)
    filledPasswordByTabId.delete(webTabId)
    passwordCapturedSignatures.delete(webTabId)
  }
  const snapshot = snapshotClosableTab(tab)
  if (snapshot) {
    pushClosedTab(snapshot)
  }
  console.log('🗑️ 关闭标签页:', { tabId, index, routeType: tab.routeType, tabsCount: browserTabs.value.length })

  if (isWebContentsViewTab(tab)) {
    await destroyWebContentsViewTab(tab)
  }
  
  // 关闭标签时立即隐藏tooltip
  hideTooltip()
  
  const isClosingActiveTab = String(activeBrowserTabId.value) === tabIdStr
  
  // 如果关闭的是当前活动标签页，先切换到其他标签页
  if (isClosingActiveTab && browserTabs.value.length > 1) {
    // 优先切换到前一个标签（左侧），如果没有则切换到后一个标签（右侧）
    let newActiveTab = null
    
    if (index > 0) {
      // 左侧有标签，切换到左侧
      newActiveTab = browserTabs.value[index - 1]
      console.log('🔄 切换到左侧标签:', newActiveTab.id, newActiveTab.routeType)
    } else if (index < browserTabs.value.length - 1) {
      // 左侧没有标签，切换到右侧
      newActiveTab = browserTabs.value[index + 1]
      console.log('🔄 切换到右侧标签:', newActiveTab.id, newActiveTab.routeType)
    }
    
    if (newActiveTab) {
      activeBrowserTabId.value = newActiveTab.id
    }
    
    // 等待 DOM 更新，确保标签页已切换
    await nextTick()
  }
  
  // 清理 refs（在删除标签之前）
  delete webviewRefs.value[tabId]
  
  // 清理 tabOrder 中的记录
  delete tabOrder.value[tabId]
  
  // 手动移除 DOM 元素（绕过 Vue 生产构建中的响应式问题）
  const tabPanel = document.querySelector(`.browser-content [data-tab-id="${tabId}"]`)
  if (tabPanel) {
    console.log('🗑️ 手动移除 DOM 元素:', tabId)
    tabPanel.remove()
  }
  
  // 使用 filter 创建新数组，确保 Vue 能检测到变化
  browserTabs.value = browserTabs.value.filter(t => String(t.id) !== tabIdStr)
  
  console.log('🗑️ 标签页已从数组移除，剩余标签数:', browserTabs.value.length)
  
  // 等待 DOM 更新
  await nextTick()
  
  // 如果关闭后没有标签页了，创建一个新的首页标签页
  if (browserTabs.value.length === 0) {
    console.log('📋 没有标签页了，创建新标签页')
    await createNewBrowserTab()
  } else {
    // 确保当前有活动标签页
    const currentActiveExists = browserTabs.value.some(t => String(t.id) === String(activeBrowserTabId.value))
    if (!currentActiveExists && browserTabs.value.length > 0) {
      activeBrowserTabId.value = browserTabs.value[0].id
      console.log('🔄 重新设置活动标签:', activeBrowserTabId.value)
    }
  }
  
  // 最后再等待一次 DOM 更新
  await nextTick()
  console.log('✅ 关闭标签页完成，当前标签数:', browserTabs.value.length)
}

const createNewBrowserTab = async () => {
  // 新建标签页使用数字 ID，与其他标签保持一致
  const tabId = nextBrowserTabId++
  const newTab = {
    id: tabId,
    url: '', // URL 为空，等待用户输入
    title: '新标签页',
    favicon: null, // 设置为 null，这样会显示 HomeIcon
    faviconError: false,
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    webviewReady: false,
    webviewSrc: '', // webview 初始为空（不加载任何内容）
    pendingUrl: '', // pendingUrl 也为空
    routeType: 'new-tab', // 特殊类型：新标签页，显示首页内容
    routeConfig: { showWebview: false }, // 新标签页不显示 webview
    routeProps: {},
    contentKind: 'builtin',
    contentHost: 'builtin',
    isPrivate: false,
    sessionPartition: resolveSessionPartition({ tabId, isPrivate: false }),
    history: [],
    forwardHistory: [],
    loadError: null
  }
  
  console.log('🆕 创建新标签页:', { id: newTab.id, routeType: newTab.routeType })
  
  browserTabs.value.push(newTab)
  
  // 初始化新标签的显示顺序（放在最后）
  const maxOrder = Math.max(...Object.values(tabOrder.value), browserTabs.value.length - 1)
  tabOrder.value[newTab.id] = maxOrder + 1
  
  await nextTick()
  
  // 切换到新标签页
  await switchBrowserTab(newTab.id)
}

const createNewPrivateBrowserTab = async () => {
  const tabId = nextBrowserTabId++
  const newTab = {
    id: tabId,
    url: '',
    title: '新建隐私标签页',
    favicon: null,
    faviconError: false,
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    webviewReady: false,
    webviewSrc: '',
    pendingUrl: '',
    routeType: 'new-tab',
    routeConfig: { showWebview: false },
    routeProps: {},
    contentKind: 'builtin',
    contentHost: 'builtin',
    isPrivate: true,
    sessionPartition: resolveSessionPartition({ tabId, isPrivate: true }),
    history: [],
    forwardHistory: [],
    loadError: null
  }

  browserTabs.value.push(newTab)
  const maxOrder = Math.max(...Object.values(tabOrder.value), browserTabs.value.length - 1)
  tabOrder.value[newTab.id] = maxOrder + 1
  await nextTick()
  await switchBrowserTab(newTab.id)
}

// 从外部调用的方法：打开新的浏览器子标签页
const openNewTab = async (url) => {
  console.log('🆕 openNewTab 被调用，URL:', url)
  if (url) {
    const normalizedUrl = normalizeUrl(url)
    console.log('🆕 创建新的浏览器子标签页:', normalizedUrl)
    
    // 创建新标签页（createBrowserTab 会自动设置 url）
    const tab = createBrowserTab(normalizedUrl)
    console.log('✅ 标签页已创建:', { id: tab.id, url: tab.url, routeType: tab.routeType })
    
    // 切换标签页
    await switchBrowserTab(tab.id)
    await nextTick()
    
    // 更新 UI 状态
      if (tab.id === activeBrowserTabId.value) {
        currentUrl.value = normalizedUrl
        urlInput.value = normalizedUrl
    }
  } else {
    const newTab = createBrowserTab()
    await switchBrowserTab(newTab.id)
  }
}

// 计算并显示tooltip
const calculateAndShowTooltip = (target, text) => {
  try {
    // 再次检查元素是否还在DOM中
    if (!target || !target.getBoundingClientRect) {
      console.warn('目标元素无效')
      return
    }
    
    const rect = target.getBoundingClientRect()
    tooltipText.value = text
    
    // 计算tooltip位置（标签中心点）
    const centerX = rect.left + rect.width / 2
    const top = rect.bottom + 8
    
    // 临时创建tooltip元素来测量宽度
    const tempDiv = document.createElement('div')
    tempDiv.style.position = 'fixed'
    tempDiv.style.visibility = 'hidden'
    tempDiv.style.whiteSpace = 'nowrap'
    tempDiv.style.fontSize = '12px'
    tempDiv.style.padding = '6px 10px'
    tempDiv.textContent = text
    document.body.appendChild(tempDiv)
    const tooltipWidth = tempDiv.offsetWidth
    document.body.removeChild(tempDiv)
    
    // 计算tooltip的左右边界
    const tooltipLeft = centerX - tooltipWidth / 2
    const tooltipRight = centerX + tooltipWidth / 2
    
    // 获取视口宽度
    const viewportWidth = window.innerWidth
    const padding = 10 // 距离边缘的最小距离
    
    let finalLeft = centerX
    let transform = 'translateX(-50%)'
    
    // 如果tooltip超出左边界，调整位置
    if (tooltipLeft < padding) {
      finalLeft = padding + tooltipWidth / 2
      transform = 'translateX(-50%)'
    }
    // 如果tooltip超出右边界，调整位置
    else if (tooltipRight > viewportWidth - padding) {
      finalLeft = viewportWidth - padding - tooltipWidth / 2
      transform = 'translateX(-50%)'
    }
    
    tooltipStyle.value = {
      top: `${top}px`,
      left: `${finalLeft}px`,
      transform: transform
    }
    tooltipVisible.value = true
    tooltipHasShown = true // 标记tooltip已经显示过
  } catch (e) {
    console.warn('获取元素位置失败:', e)
  }
}

// Tooltip 显示/隐藏
const showTooltip = (event, text) => {
  // 立即保存事件目标元素，因为setTimeout后事件对象可能失效
  const target = event?.currentTarget || event?.target
  
  if (!target) {
    console.warn('无法找到目标元素')
    return
  }
  
  // 标记鼠标在标签区域内
  isInTabsArea = true
  
  // 清除之前的定时器
  if (tooltipTimer) {
    clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
  
  // 如果tooltip已经显示过（且鼠标一直在标签区域内），立即更新内容（平滑切换，不需要等待）
  if (tooltipHasShown) {
    calculateAndShowTooltip(target, text)
    return
  }
  
  // 如果tooltip还没显示过，等待1秒后显示
  tooltipTimer = setTimeout(() => {
    calculateAndShowTooltip(target, text)
    tooltipTimer = null
  }, 1000)
}

const hideTooltip = () => {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
  tooltipVisible.value = false
  tooltipText.value = ''
  // 注意：不重置 tooltipHasShown，这样即使tooltip被隐藏，移动到新标签时也能立即显示
}

// 鼠标离开标签区域
const onTabsBarMouseLeave = () => {
  isInTabsArea = false
  // 重置 tooltipHasShown，这样再次移入时需要重新计时
  tooltipHasShown = false
  // 隐藏tooltip
  hideTooltip()
}

const {
  saveBrowserTabs,
  restoreBrowserTabs
} = useBrowserPersistence({
  browserTabs,
  activeBrowserTabId,
  tabOrder,
  isRestoringTabs,
  electronAPI: window.electronAPI,
  createBrowserTab,
  switchBrowserTab,
  routeConfig,
  resolveSessionPartition
})

// 监听标签页变化，自动保存
watch(() => browserTabs.value.length, () => {
  // 延迟保存，避免频繁保存
  setTimeout(() => {
    saveBrowserTabs()
  }, 500)
})

watch(() => activeBrowserTabId.value, () => {
  // 延迟保存，避免频繁保存
  setTimeout(() => {
    saveBrowserTabs()
  }, 500)
})

watch(
  () => ({
    activeTabId: activeBrowserTabId.value,
    routeType: currentTab.value?.routeType || '',
    path: currentTab.value?.routeProps?.path || ''
  }),
  () => {
    emitProjectContext()
  },
  { immediate: true, deep: false }
)

// 监听标签页 URL 变化，自动保存
watch(() => browserTabs.value.map(tab => ({ id: tab.id, url: tab.url, title: tab.title })), () => {
  // 延迟保存，避免频繁保存
  setTimeout(() => {
    saveBrowserTabs()
  }, 1000)
}, { deep: true })

// 暴露方法给父组件
defineExpose({
  openNewTab,
  openProjectRoute,
  getOpenedProjectPaths,
  refresh,
  stopRefreshing
})

// 当 URL 更新时，同步到当前标签页
watch(() => currentUrl.value, (newUrl) => {
  if (currentTab.value) {
    const routeType = currentTab.value.routeType || 'new-tab'
    const shouldSyncBrowserState = routeType === 'webview' || routeType === 'new-tab' || routeType === 'browser-tab'
    if (!shouldSyncBrowserState) {
      return
    }
    currentTab.value.url = newUrl
    // 如果 URL 为空，不设置 title 为 'about:blank'，保持为空或 '新标签页'
    if (!newUrl || newUrl === '') {
      // 新标签页保持 title 为空或 '新标签页'，不显示 'about:blank'
      if (!currentTab.value.title || currentTab.value.title === 'about:blank') {
        currentTab.value.title = '新标签页'
      }
    } else if (!currentTab.value.title || currentTab.value.title === '新标签页') {
      // 更新标签页标题（如果是 URL）
      try {
        // 验证 URL 是否有效
        if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
          const urlObj = new URL(newUrl)
          currentTab.value.title = urlObj.hostname
        } else {
          currentTab.value.title = newUrl
        }
      } catch (e) {
        currentTab.value.title = newUrl
      }
    }
  }
  
})

watch(() => pageTitle.value, (newTitle) => {
  const routeType = currentTab.value?.routeType || ''
  const shouldSyncBrowserState = routeType === 'webview' || routeType === 'new-tab' || routeType === 'browser-tab'
  if (currentTab.value && newTitle && shouldSyncBrowserState) {
    currentTab.value.title = newTitle
  }
})

watch(() => loadingProgressVisible.value, () => {
  nextTick(() => {
    syncWebContentsViewBounds()
  })
})

// 初始化
onMounted(async () => {
  console.log('🚀 Browser 组件已挂载')
  console.log('📋 Props:', { initialUrl: props.initialUrl })

  try {
    bindWebContentsViewEvents()
    syncWebContentsViewBounds()
    if (typeof ResizeObserver !== 'undefined' && browserContentRef.value) {
      const observer = new ResizeObserver(() => {
        syncWebContentsViewBounds()
      })
      observer.observe(browserContentRef.value)
      browserContentRef.value.__contentBoundsObserver = observer
    }

  await loadFavorites()
  await loadCloneDirectories() // 加载克隆目录列表
  await loadBrowsingHistory() // 加载历史记录
  await loadSavedPasswords()
    
    const shortcutController = useBrowserShortcuts({
      'new-tab': () => createNewBrowserTab(),
      'close-tab': () => {
        if (activeBrowserTabId.value) closeBrowserTab(activeBrowserTabId.value)
      },
      'restore-closed-tab': () => restoreClosedBrowserTab(),
      'focus-address-bar': () => {
        nextTick(() => {
          const input = urlInputRef.value || document.querySelector('.url-input')
          if (input) {
            input.focus()
            input.select()
          }
        })
      },
      'reload-tab': () => refresh(),
      'force-reload-tab': () => refresh(),
      'go-back': () => goBack(),
      'go-forward': () => goForward()
    })
    shortcutController.mount()
    const handleResize = () => {
      syncWebContentsViewBounds()
      syncActiveContentHost()
    }
    window.addEventListener('resize', handleResize)
    console.log('✅ 浏览器快捷键监听器已注册')

    // 保存引用以便卸载时移除
    window.__browserShortcutController = shortcutController
    window.__browserResizeHandler = handleResize

    window.addEventListener('pointerdown', onGlobalPointerDownDismissUrlSuggestions, true)
    window.__browserUrlSuggestionsPointerDown = onGlobalPointerDownDismissUrlSuggestions
  
  // 监听菜单事件
  if (window.electronAPI) {
    if (window.electronAPI.onRefreshCurrentTab) {
      window.electronAPI.onRefreshCurrentTab(handleRefreshCurrentTabMessage)
    }
    if (window.electronAPI.onExportFavorites) {
      window.electronAPI.onExportFavorites(() => {
        exportFavorites()
      })
    }
    if (window.electronAPI.onImportFavorites) {
      window.electronAPI.onImportFavorites(() => {
        importFavorites()
      })
    }
    // 监听主进程发来的新标签页打开请求（用于 webview 中的新窗口拦截）
    if (window.electronAPI.onOpenUrlInNewTab) {
      window.electronAPI.onOpenUrlInNewTab((url) => {
        console.log('🔗 收到主进程新标签页请求:', url)
        if (url && (url.startsWith('http') || url.startsWith('about:') || url.startsWith('git:'))) {
          openNewTab(url)
        }
      })
    }
    
    // 监听打开 webview DevTools 请求
    if (window.electronAPI.onOpenWebviewDevTools) {
      window.electronAPI.onOpenWebviewDevTools(() => {
        console.log('🔧 收到打开 webview DevTools 请求')
        openActiveWebviewDevTools()
      })
    }

    // 监听刷新完成事件（用于恢复 tab 图标）
    if (window.electronAPI.onRefreshComplete) {
      window.electronAPI.onRefreshComplete(() => {
        console.log('✅ 收到刷新完成通知')
        // 恢复当前活动标签页的刷新状态
        const currentTab = browserTabs.value.find(t => t.id === activeBrowserTabId.value)
        if (currentTab && currentTab.isRefreshing) {
          currentTab.isRefreshing = false
          console.log('✅ 已恢复 tab 图标:', currentTab.id)
        }
      })
    }
    if (window.electronAPI.onBrowserUrlSuggestionResult) {
      window.electronAPI.onBrowserUrlSuggestionResult(handleUrlSuggestionResult)
    }
  }
  
    // 如果有 initialUrl，直接创建标签页（不恢复）
    if (props.initialUrl) {
      // watch 会在 immediate: true 时处理
      isBrowserReady.value = true
      return
    }
    
    // 尝试恢复上次未关闭的标签页
    const restored = await restoreBrowserTabs()
    
    // 如果没有恢复成功或没有标签页，创建一个新标签页
    if (!restored || browserTabs.value.length === 0) {
      console.log('📋 没有历史标签，创建新标签页')
      await createNewBrowserTab()
    } else if (browserTabs.value.length > 0) {
      // 如果有恢复的标签页，确保有一个是活动的
      if (!activeBrowserTabId.value) {
        await switchBrowserTab(browserTabs.value[0].id)
      }
    }
    
    // 标记浏览器已准备好
    isBrowserReady.value = true
  } catch (error) {
    console.error('❌ Browser 组件初始化失败:', error)
    isBrowserReady.value = true // 即使出错也标记为准备好，避免一直不显示
  }
})

// 组件卸载时保存标签页
onUnmounted(() => {
  clearTimeout(urlSuggestionDebounceTimer)
  urlSuggestionDebounceTimer = null
  clearTimeout(urlSuggestionIndexDebounceTimer)
  urlSuggestionIndexDebounceTimer = null
  if (typeof window !== 'undefined' && window.__urlSuggestionEscHandler) {
    window.removeEventListener('keydown', window.__urlSuggestionEscHandler, true)
    delete window.__urlSuggestionEscHandler
  }
  window.electronAPI?.removeBrowserUrlSuggestionResultListener?.()
  void window.electronAPI?.closeBrowserUrlSuggestions?.()
  clearLoadingProgressTimers()
  filledPasswordByTabId.clear()
  lastFilledUrlByTabId.clear()
  passwordCapturedSignatures.clear()
  hideAllWebContentsViewTabs()
  browserContentRef.value?.__contentBoundsObserver?.disconnect()
  denyPermissionRequests(clearPermissionPrompts())

  if (window.electronAPI) {
    window.electronAPI.removeRefreshCurrentTabListener?.(handleRefreshCurrentTabMessage)
    window.electronAPI.removeWebTabStateChangedListener?.()
    window.electronAPI.removeWebTabTitleUpdatedListener?.()
    window.electronAPI.removeWebTabFaviconUpdatedListener?.()
    window.electronAPI.removeWebTabLoadFailedListener?.()
    window.electronAPI.removeWebTabLifecycleChangedListener?.()
    window.electronAPI.removeWebDownloadStateChangedListener?.()
    window.electronAPI.removeBrowserPermissionRequestedListener?.()
    window.electronAPI.removeWebTabPasswordCapturedListener?.()
  }
  if (window.__browserShortcutController) {
    window.__browserShortcutController.unmount?.()
    delete window.__browserShortcutController
    console.log('🧹 浏览器快捷键监听器已移除')
  }
  if (window.__browserResizeHandler) {
    window.removeEventListener('resize', window.__browserResizeHandler)
    delete window.__browserResizeHandler
  }
  if (window.__browserUrlSuggestionsPointerDown) {
    window.removeEventListener('pointerdown', window.__browserUrlSuggestionsPointerDown, true)
    delete window.__browserUrlSuggestionsPointerDown
  }
  
  saveBrowserTabs()
})

// 监听 URL 变化（从外部打开新 URL 时创建新的浏览器子标签页）
watch(() => props.initialUrl, (newUrl, oldUrl) => {
  // 如果有新 URL，且与旧 URL 不同，在浏览器内部创建新的子标签页
  if (newUrl && newUrl !== oldUrl) {
    const normalizedUrl = normalizeUrl(newUrl)
    console.log('🔄 检测到 initialUrl 变化，在浏览器内部创建新的子标签页:', newUrl, { oldUrl, normalizedUrl })
    
    // 直接创建新的浏览器子标签页（不检查是否已存在，因为用户可能想打开多个相同 URL 的标签页）
    const tab = createBrowserTab(normalizedUrl)
    switchBrowserTab(tab.id)
  } else if (newUrl && !oldUrl) {
    // 首次加载时如果有 initialUrl，也创建浏览器子标签页
    const normalizedUrl = normalizeUrl(newUrl)
    console.log('🔄 首次加载，创建浏览器子标签页:', normalizedUrl)
    const tab = createBrowserTab(normalizedUrl)
    switchBrowserTab(tab.id)
  }
}, { immediate: true })
</script>

<style scoped>
.browser-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--theme-sem-bg-workspace);
}

.browser-tabs-bar {
  display: flex;
  align-items: center;
  background: var(--theme-comp-child-header-bg);
  padding: 0 6px;
  gap: 0;
  flex-shrink: 0;
  overflow: hidden; /* 禁止整个标签栏滚动 */
  height: 40px;
  min-height: 40px;
  -webkit-app-region: no-drag; /* 标签栏本身不可拖拽 */
  position: relative;
}

/* 系统菜单预留空间 */
.system-menu-space {
  width: 0;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: drag; /* 系统菜单区域可拖拽 */
}

.browser-tabs-list {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto; /* 只占用内容所需空间，不扩展 */
  height: 100%;
  overflow: hidden; /* 不允许滚动，标签自动缩小 */
  min-width: 0; /* 允许 flex 子元素缩小 */
  max-width: calc(100% - 32px); /* 最大宽度，确保右侧至少保留 32px 空间（和加号按钮一样宽） */
  -webkit-app-region: no-drag; /* 标签列表不可拖拽 */
  position: relative;
  z-index: 15; /* 确保在拖拽区域下方 */
}

.tabs-bar-menu-wrapper {
  display: flex;
  align-items: center;
  height: 100%;
  flex: 0 0 auto;
  margin-left: 6px;
  margin-right: 4px;
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 16;
}

.tabs-bar-menu-btn {
  width: 32px;
  height: 32px;
  padding: 0;
}

/* 标签栏右侧拖拽区域 */
.tabs-bar-drag-area {
  flex: 1; /* 占据所有剩余空间，当标签少时整个右侧都可以拖拽 */
  min-width: 32px; /* 最小宽度 32px，和加号按钮一样宽，确保标签撑满时也能拖拽 */
  height: 100%;
  -webkit-app-region: drag; /* 支持拖拽窗口 */
  position: relative;
  z-index: 1; /* z-index 低于标签列表和密码管理页面 */
  pointer-events: auto; /* 确保可以交互 */
}

.browser-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px 0 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease; /* 只过渡背景色和文字颜色，不过渡尺寸 */
  white-space: nowrap;
  min-width: 60px; /* 最小宽度，只显示图标和部分标题 */
  width: 200px; /* 默认固定宽度 */
  flex: 0 1 200px; /* 不扩展，只在空间不足时缩小 */
  height: calc(100% - 8px);
  margin: 4px 0;
  box-sizing: border-box;
  position: relative;
  color: var(--theme-sem-text-secondary);
  font-size: 13px;
  font-weight: 500;
  -webkit-app-region: no-drag; /* 标签不可拖拽窗口 */
  overflow: hidden; /* 隐藏溢出内容 */
  user-select: none; /* 标签项本身不可选中，保持可点击 */
  z-index: 20; /* 确保在拖拽区域上方 */
  pointer-events: auto; /* 确保可以点击 */
  border-radius: 10px;
}

.browser-tab-item.leading-tab {
  padding-left: v-bind(leadingTabInsetCss);
}

/* 标签拖拽样式 - 非首页标签可拖拽 */
.browser-tab-item:not(:first-child) {
  /* 不改变鼠标样式 */
}

.browser-tab-item.dragging {
  opacity: 0.3;
}

.browser-tab-item.drag-over {
  background: color-mix(in srgb, var(--theme-comp-tab-active-bg) 82%, transparent);
  border-radius: 10px;
}

/* 拖拽克隆元素样式 */
.drag-clone {
  background: var(--theme-sem-surface-2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  transition: none !important;
}

.browser-tab-item.drag-over::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--theme-sem-accent-primary);
  border-radius: 1px;
}

/* 拖拽时子元素不阻止事件 */
.browser-tab-item .browser-tab-icon,
.browser-tab-item .browser-tab-title {
  pointer-events: none;
}

/* 关闭按钮保持可点击，但在拖拽开始后也不阻止 */
.browser-tab-item.dragging .browser-tab-close {
  pointer-events: none;
}

/* 分隔线的显示/隐藏现在完全由 JS 通过 hide-separator 类控制 */

.browser-tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--theme-sem-text-secondary);
}

.browser-tab-icon .tab-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 2px;
}

.browser-tab-item.active .browser-tab-icon {
  color: var(--theme-sem-text-primary);
}

.browser-tab-item.active {
  background: var(--theme-comp-tab-active-bg);
  color: var(--theme-sem-text-primary);
  font-weight: 500; /* 保持与未选中状态相同的字重，避免视觉上的放大效果 */
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
  position: relative;
  z-index: 1;
}

.browser-tab-item:hover {
  background: var(--theme-sem-hover);
}

.browser-tab-item.active:hover {
  background: var(--theme-comp-tab-active-bg);
}

/* 选中态下边的柔和衔接 */
.browser-tab-item.active::before {
  content: none;
}

/* Tooltip 样式 */
.browser-tab-tooltip {
  position: fixed;
  padding: 6px 10px;
  background: var(--theme-sem-bg-tooltip);
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  white-space: nowrap;
  border-radius: 4px;
  pointer-events: none;
  z-index: 10000;
  max-width: 500px;
  overflow: visible;
  text-overflow: clip;
  animation: tooltipFadeIn 0.2s ease;
}

@keyframes tooltipFadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.browser-tab-title {
  flex: 1;
  font-size: 13px;
  color: var(--theme-sem-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s ease; /* 只过渡颜色，不过渡尺寸 */
  user-select: none; /* 禁止选中文字 */
  cursor: pointer; /* 保持指针光标，点击可切换 */
  pointer-events: auto; /* 确保可以交互 */
}

.browser-tab-item:hover .browser-tab-title {
  color: var(--theme-sem-text-primary);
}

.browser-tab-item.active .browser-tab-title {
  color: var(--theme-sem-text-primary);
  font-weight: 500; /* 保持与未选中状态相同的字重，避免视觉上的放大效果 */
}

.browser-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
  color: var(--theme-sem-text-muted);
  opacity: 0.34;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  flex-shrink: 0;
  margin-left: 4px;
  -webkit-app-region: no-drag; /* 关闭按钮不可拖拽窗口 */
  pointer-events: auto; /* 确保可以点击 */
  user-select: none; /* 不可选中 */
  position: relative;
  z-index: 25; /* 确保在最上层，可以点击 */
}

.browser-tab-item.active .browser-tab-close {
  color: var(--theme-sem-text-secondary);
  opacity: 0.56;
}

.browser-tab-item:hover .browser-tab-close {
  opacity: 0.72;
}

.browser-tab-close:hover {
  color: var(--theme-sem-text-primary);
  background: color-mix(in srgb, var(--theme-sem-hover) 92%, transparent);
  opacity: 1;
}

.browser-tab-new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  color: var(--theme-sem-text-secondary);
  transition: background-color 0.2s ease, color 0.2s ease;
  flex-shrink: 0;
  margin-left: 4px;
  -webkit-app-region: no-drag; /* 创建按钮不可拖拽窗口 */
  position: relative;
  z-index: 10; /* 确保在最上层 */
  pointer-events: auto; /* 确保可以点击 */
}

.browser-tab-new:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.browser-toolbar {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: var(--theme-comp-child-header-bg);
  gap: 8px;
  flex-shrink: 0;
  min-height: 44px;
  -webkit-app-region: no-drag; /* 工具栏不可拖拽窗口 */
  position: relative;
  z-index: 5; /* 确保在拖拽区域上方 */
}

.loading-progress-track {
  height: 2px;
  width: 100%;
  background: var(--theme-sem-border-default);
  flex-shrink: 0;
  overflow: hidden;
}

.loading-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--theme-sem-accent-primary) 0%, var(--theme-sem-accent-primary-strong) 100%);
  transition: width 0.14s ease-out;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
  position: relative;
}

.toolbar-menu-wrapper {
  position: relative;
  z-index: 10001; /* 确保在密码管理页面上方 */
}

.toolbar-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99998;
  background: transparent;
  -webkit-app-region: no-drag; /* 禁用窗口拖拽，确保点击事件能被捕获 */
}

.toolbar-menu {
  position: fixed; /* 使用 fixed 定位，不受父容器影响 */
  background: var(--theme-sem-bg-menu);
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
  min-width: 160px;
  z-index: 99999; /* 最高层级 */
  overflow: hidden;
  pointer-events: auto !important;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 6px;
  padding: 9px 10px;
  color: var(--theme-sem-text-primary);
  cursor: pointer;
  transition: background 0.2s;
  font-size: 13px;
  pointer-events: auto !important;
  -webkit-app-region: no-drag !important;
  user-select: none;
  border-radius: 8px;
}

.menu-item * {
  pointer-events: none; /* 子元素不阻止点击 */
}

.menu-item:hover {
  background: var(--theme-sem-hover);
}

.menu-divider {
  height: 1px;
  background: var(--theme-sem-border-default);
  margin: 6px 6px;
}

.menu-item svg {
  flex-shrink: 0;
}

.toolbar-center {
  flex: 1;
  display: flex;
  margin: 0 8px; /* 减小左右间距，与左侧按钮组保持一致 */
}

.url-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}

.url-input {
  flex: 1;
  width: 100%;
  padding: 6px 104px 6px 12px; /* 右侧留出空间给地址栏动作按钮组 */
  border: 1px solid var(--theme-sem-border-strong);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: color-mix(in srgb, var(--theme-sem-bg-project) 78%, var(--theme-sem-surface-1) 22%);
  color: var(--theme-sem-text-primary);
  -webkit-text-fill-color: var(--theme-sem-text-primary);
  caret-color: var(--theme-sem-accent-primary);
  color-scheme: inherit;
  -webkit-app-region: no-drag; /* URL输入框不可拖拽窗口 */
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--theme-sem-border-default) 42%, transparent);
}

.url-input::selection {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 24%, transparent);
  color: var(--theme-sem-text-primary);
}

/* about: 自动补全提示（无 Electron 浮层 API 时的降级，在地址栏下方展开） */
.about-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  max-height: min(42vh, 360px);
  overflow-x: hidden;
  overflow-y: auto;
  background: color-mix(in srgb, var(--theme-sem-bg-menu) 92%, var(--theme-sem-surface-1) 8%);
  border: 1px solid var(--theme-sem-border-strong);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
  z-index: 10000;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 6px;
  padding: 9px 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-radius: 8px;
}

.suggestion-item:hover,
.suggestion-item.active {
  background: var(--theme-sem-hover);
}

.suggestion-item.active {
  background: var(--theme-comp-sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.suggestion-icon {
  color: var(--theme-sem-text-muted);
  flex-shrink: 0;
}

.suggestion-favicon {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  flex-shrink: 0;
  object-fit: contain;
}

.suggestion-item.active .suggestion-icon {
  color: var(--theme-sem-accent-primary);
}

.suggestion-url {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 13px;
  color: var(--theme-sem-text-primary);
}

.suggestion-title {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
  margin-left: auto;
}

.url-input-actions {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.url-input-favorite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent; /* 无背景 */
  border-radius: 10px;
  cursor: pointer;
  color: var(--theme-sem-text-muted);
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-app-region: no-drag; /* 收藏按钮不可拖拽窗口 */
  padding: 0;
  flex-shrink: 0;
}

.url-input-favorite-btn:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.url-input-favorite-btn.active {
  color: #fbbf24; /* 收藏时显示黄色 */
}

.url-input-favorite-btn.disabled {
  color: color-mix(in srgb, var(--theme-sem-text-muted) 56%, transparent);
  cursor: not-allowed;
}

.url-input-favorite-btn.disabled:hover {
  color: color-mix(in srgb, var(--theme-sem-text-muted) 56%, transparent);
}

.url-input::placeholder {
  color: var(--theme-sem-text-secondary);
}

.url-input:focus {
  border-color: var(--theme-sem-accent-primary);
  background: color-mix(in srgb, var(--theme-sem-bg-project) 72%, var(--theme-sem-surface-1) 28%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-sem-accent-primary) 16%, transparent);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  color: var(--theme-sem-text-muted);
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-app-region: no-drag; /* 工具栏按钮不可拖拽窗口 */
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  color: color-mix(in srgb, var(--theme-sem-text-muted) 72%, transparent);
}

.toolbar-btn.active {
  color: var(--theme-sem-text-primary);
  background: var(--theme-sem-hover);
}

.browser-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.browser-permission-banner {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(52, 46, 33, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 244, 220, 0.92);
}

.permission-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.permission-title {
  font-size: 12px;
  font-weight: 700;
}

.permission-detail,
.permission-meta {
  font-size: 11px;
  opacity: 0.9;
}

.permission-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.permission-btn {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: inherit;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.permission-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.08);
}

.permission-btn.primary {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.06);
}

.permission-btn.primary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.permission-btn.danger {
  background: rgba(109, 42, 42, 0.2);
  border-color: rgba(255, 255, 255, 0.04);
}

.permission-btn.danger:hover {
  background: rgba(128, 34, 34, 0.3);
}

.browser-error-banner {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(76, 33, 33, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: #ffd7d7;
}

.browser-error-banner.with-permission-banner {
  top: 72px;
}

.error-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.error-title {
  font-size: 12px;
  font-weight: 700;
}

.error-detail {
  font-size: 11px;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.error-retry-btn {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.error-retry-btn:hover {
  background: rgba(255, 255, 255, 0.11);
}

.download-status-panel {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(340px, calc(100% - 24px));
}

.download-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-sem-surface-2) 94%, transparent);
  border: 1px solid var(--theme-sem-border-default);
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  font-weight: 600;
}

.download-close {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.download-close:hover {
  background: rgba(255, 255, 255, 0.08);
}

.download-empty {
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-sem-surface-2) 90%, transparent);
  border: 1px solid var(--theme-sem-border-default);
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
  text-align: center;
}

.download-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-sem-surface-2) 90%, transparent);
  border: 1px solid var(--theme-sem-border-default);
  color: var(--theme-sem-text-primary);
  backdrop-filter: blur(8px);
}

.download-name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-state,
.download-progress {
  font-size: 11px;
  opacity: 0.8;
}

.browser-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--theme-sem-bg-workspace);
}

/* 内容容器样式 - 使用绝对定位覆盖整个区域 */
.browser-main > * {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

/* 标签页面板容器 - NewTabPage 自己控制 display */
.tab-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--theme-sem-bg-workspace);
}


/* 非活动 webview 标签页占位符 */
.webview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme-sem-bg-workspace);
  color: var(--theme-sem-text-muted);
}

.placeholder-text {
  font-size: 14px;
}

/* 标签页内容容器 - 每个标签页一个 */
.tab-content-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--theme-sem-bg-workspace);
  display: flex;
  flex-direction: column;
}

/* 活动标签页 - 显示 */
.tab-active {
  visibility: visible !important;
  z-index: 10 !important;
  pointer-events: auto !important;
  opacity: 1 !important;
}

/* 隐藏的标签页 */
.tab-hidden {
  visibility: hidden !important;
  z-index: -1 !important;
  pointer-events: none !important;
  opacity: 0 !important;
}

/* 内容容器 - 非 webview 内容，需要更高的 z-index 覆盖 webview */
.content-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 10;
  background: var(--theme-sem-bg-workspace);
}

/* 特殊页面容器样式 */
.special-page-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--theme-sem-bg-workspace);
  z-index: 10;
}

/* remote-repo-container 和 clone-directory-container 继承父级样式 */

/* WebView 容器 - 默认隐藏 */
.webview-container {
  background: var(--theme-sem-bg-workspace);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

/* 容器样式已简化，使用 v-show 控制显示/隐藏 */


/* WebView 容器顶部拖拽区域（不占用空间） */
.webview-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px; /* 拖拽区域高度 */
  -webkit-app-region: drag; /* 允许拖拽窗口 */
  z-index: 10;
  pointer-events: auto;
}

/* 标签页 loading 状态 */
.tab-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  animation: spin 1s linear infinite;
  opacity: 0.8;
  color: rgba(255, 255, 255, 0.9);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

</style>
