<template>
  <div class="tab-manager">
    <!-- Tab 标签栏（左侧竖排） -->
    <div class="tab-bar">
      <!-- 顶部标题区域 -->
      <div class="tab-bar-header">
        <div class="tab-bar-title">OpenGit</div>
      </div>
      <div class="tab-list">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: activeTabId === tab.id }"
          @click="switchTab(tab.id)"
        >
          <div class="tab-icon">
            <HomeIcon v-if="tab.type === 'home' && !tab.props.path" :size="16" />
            <Folder v-else-if="tab.type === 'home' && tab.props.path" :size="16" />
            <HomeIcon v-else-if="tab.type === 'initialization'" :size="16" />
            <Globe v-else-if="tab.type === 'browser'" :size="16" />
            <Folder v-else :size="16" />
          </div>
          <span class="tab-title">{{ tab.title }}</span>
          <button
            v-if="tab.type !== 'initialization' && !(tab.type === 'home' && !tab.props.path) && tab.type !== 'browser'"
            class="tab-close"
            @click.stop="closeTab(tab.id)"
            title="关闭标签页"
          >
            <X :size="12" />
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 内容区域 -->
    <div class="tab-content">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        v-show="activeTabId === tab.id"
        class="tab-panel"
      >
        <component
          :is="tab.component"
          v-bind="tab.props"
          :key="`${tab.id}-${refreshKey}`"
          :ref="(el) => setTabRef(tab.id, el)"
          @navigate="handleNavigate"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, markRaw } from 'vue'
import { X, Home as HomeIcon, Settings, Folder, Globe } from 'lucide-vue-next'
import GitProject from '../git/GitProject.vue'
import RemoteRepo from '../git/RemoteRepo.vue'
import Browser from './Browser.vue'

const props = defineProps({
  initialTab: {
    type: String,
    default: 'home'
  }
})

const emit = defineEmits(['navigate'])

// Tab 数据
const tabs = ref([])
const activeTabId = ref(null)
const refreshKey = ref(0) // 用于强制刷新组件的key
const tabRefs = ref({}) // 存储每个tab的组件引用
let nextTabId = 1

// 可用的组件映射（使用 markRaw 避免响应式包装）
const componentMap = {
  home: markRaw(GitProject),
  initialization: markRaw(RemoteRepo),
  browser: markRaw(Browser)
}

// 计算属性

// 方法
const createTab = (type, title, props = {}) => {
  const tab = {
    id: nextTabId++,
    type,
    title,
    component: componentMap[type],
    props
  }
  
  // 如果是 browser tab，固定在主页下方（索引1的位置）
  if (type === 'browser') {
    const homeTabIndex = tabs.value.findIndex(t => t.type === 'home' && !t.props.path)
    if (homeTabIndex !== -1) {
      // 如果主页存在，插入到主页下方
      tabs.value.splice(homeTabIndex + 1, 0, tab)
    } else {
      // 如果主页不存在，直接添加
      tabs.value.push(tab)
    }
  } else {
  tabs.value.push(tab)
  }
  
  return tab
}

const switchTab = async (tabId) => {
  console.log('🔄💎 TabManager switchTab被调用, tabId:', tabId)
  activeTabId.value = tabId
  
  // 🚀 切换tab时，如果是目录tab，更新tab顺序
  const tab = tabs.value.find(t => t.id === tabId)
  console.log('🔍💎 找到的tab:', tab ? `${tab.type} - ${tab.props.path || 'no path'}` : 'null')
  
  if (tab && tab.type === 'home' && tab.props.path) {
    console.log('📝💎 开始更新tab顺序:', tab.props.path)
    await manageTabOrder(tab.props.path, 'switch')
    console.log('✅💎 切换tab顺序更新成功:', tab.props.path)
  }
}

const closeTab = async (tabId) => {
  const index = tabs.value.findIndex(tab => tab.id === tabId)
  if (index === -1) return

  const tab = tabs.value[index]
  
  // 检查是否是初始化标签页，初始化标签页不可关闭
  if (tab.type === 'initialization') {
    return
  }
  
  // 检查是否是第一个主页标签页（没有path属性的），不可关闭
  if (tab.type === 'home' && !tab.props.path) {
    return
  }
  
  // 检查是否是浏览器标签页，浏览器标签页不可关闭
  if (tab.type === 'browser') {
    return
  }

  // 📝 记录要关闭的路径和ID
  const pathToClose = tab.type === 'home' && tab.props.path ? tab.props.path : null
  
  tabs.value.splice(index, 1)

  // 🚀 如果关闭的是目录tab，更新tab顺序（在splice之后检查）
  if (pathToClose) {
    await manageTabOrder(pathToClose, 'close')
  }

  // 如果关闭的是当前活动标签页，切换到其他标签页
  if (activeTabId.value === tabId) {
    if (tabs.value.length > 0) {
      const newIndex = Math.min(index, tabs.value.length - 1)
      const newTab = tabs.value[newIndex]
      await switchTab(newTab.id)
    } else {
      activeTabId.value = null
    }
  }
}


const openTab = async (type, title, props = {}) => {
  // 🚀 对于初始化页面，总是允许创建
  if (type === 'initialization') {
    const newTab = createTab(type, title, props)
    await switchTab(newTab.id)
    return newTab
  }
  
  // 🚀 对于 browser 类型，如果已存在就切换到它，并调用方法创建新的浏览器子标签页
  if (type === 'browser') {
    console.log('🌐 TabManager openTab: 处理 browser 类型, props:', props)
    const existingTab = tabs.value.find(tab => tab.type === type)
    if (existingTab) {
      console.log('✅ TabManager: 找到已存在的 browser 标签页:', existingTab.id)
      // 切换到已存在的 browser 标签页
      await switchTab(existingTab.id)
      // 通过组件引用直接调用方法创建新的浏览器子标签页
      await nextTick()
      const browserComponent = tabRefs.value[existingTab.id]
      console.log('🔍 TabManager: browserComponent:', browserComponent, 'initialUrl:', props.initialUrl)
      if (browserComponent && browserComponent.openNewTab && props.initialUrl) {
        console.log('🔄 TabManager: 调用 Browser 组件的 openNewTab 方法:', props.initialUrl)
        await browserComponent.openNewTab(props.initialUrl)
      } else if (props.initialUrl) {
        console.log('⏳ TabManager: 组件未准备好，等待后重试...')
        // 如果组件还没准备好，等待一下再试
        await nextTick()
        await new Promise(resolve => setTimeout(resolve, 100))
        const browserComponentRetry = tabRefs.value[existingTab.id]
        console.log('🔍 TabManager: 重试时 browserComponent:', browserComponentRetry)
        if (browserComponentRetry && browserComponentRetry.openNewTab) {
          console.log('🔄 TabManager: 重试调用 Browser 组件的 openNewTab 方法:', props.initialUrl)
          await browserComponentRetry.openNewTab(props.initialUrl)
        } else {
          console.log('⚠️ TabManager: 重试后仍然无法调用 openNewTab，使用 props 方式')
          // 如果还是不行，更新 props 让 watch 处理
        existingTab.props = { ...existingTab.props, initialUrl: props.initialUrl }
        refreshKey.value++
        }
      } else {
        console.log('⚠️ TabManager: 没有 initialUrl，无法创建新标签页')
      }
      window.__browserTabId = existingTab.id
      return existingTab
    } else {
      console.log('🆕 TabManager: browser 标签页不存在，创建新的')
      // 如果不存在，创建新的 browser 标签页
      const newTab = createTab(type, title, props)
      window.__browserTabId = newTab.id
      await switchTab(newTab.id)
      // 等待 Browser 组件准备好后，调用 openNewTab 创建新的 webview 标签页
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 200))
      const browserComponent = tabRefs.value[newTab.id]
      console.log('🔍 TabManager: 新创建的 browserComponent:', browserComponent, 'initialUrl:', props.initialUrl)
      if (browserComponent && browserComponent.openNewTab && props.initialUrl) {
        console.log('🔄 TabManager: 新创建的 Browser 标签页，调用 openNewTab 方法:', props.initialUrl)
        await browserComponent.openNewTab(props.initialUrl)
      } else {
        console.log('⚠️ TabManager: 新创建的 Browser 标签页，组件未准备好或没有 initialUrl')
      }
      return newTab
    }
  }
  
  // 对于home类型的标签页，检查是否已存在相同路径的标签页
  if (type === 'home' && props.path) {
    const existingTab = tabs.value.find(tab => 
      tab.type === type && tab.props.path === props.path
    )
    if (existingTab) {
      // 🔄 切换到已存在的tab，switchTab会更新tab顺序
      await switchTab(existingTab.id)
      return existingTab
    }
  } else {
    // 对于其他类型，检查是否已存在相同类型的标签页
    const existingTab = tabs.value.find(tab => tab.type === type)
    if (existingTab) {
      await switchTab(existingTab.id)
      return existingTab
    }
  }

  // 创建新标签页
  const newTab = createTab(type, title, props)
  await switchTab(newTab.id)
  
  // 🚀 如果是新打开的目录tab，添加到tab顺序
  if (newTab.type === 'home' && newTab.props.path) {
    await manageTabOrder(newTab.props.path, 'open')
  }
  
  return newTab
}

const handleNavigate = (type, title, props) => {
  console.log('🔄 TabManager handleNavigate 被调用:', { type, title, props })
  openTab(type, title, props)
}

// 设置 tab 的 ref 引用
const setTabRef = (tabId, el) => {
  if (el) {
    // 如果是数组，取第一个元素
    const componentInstance = Array.isArray(el) ? el[0] : el
    tabRefs.value[tabId] = componentInstance
  } else {
    // 组件卸载时清除引用
    delete tabRefs.value[tabId]
  }
}

// 刷新当前标签页的方法
const refreshCurrentTab = () => {
  console.log('🔄 刷新按钮被点击或快捷键被触发')
  const currentTab = tabs.value.find(tab => tab.id === activeTabId.value)
  console.log('📋 当前标签页:', currentTab)
  
  if (currentTab) {
    // 🔧 优化：优先调用组件的 refresh 方法（如果存在），避免强制重新渲染
    const tabRef = tabRefs.value[currentTab.id]
    if (tabRef && typeof tabRef.refresh === 'function') {
      console.log('🔄 调用组件的 refresh 方法')
      tabRef.refresh()
    } else {
      // 如果组件没有 refresh 方法，则使用key值强制组件重新渲染
      console.log('🔄 强制刷新当前标签页组件')
      refreshKey.value++
      console.log('✅ 组件key已更新:', refreshKey.value)
    }
  } else {
    console.log('❌ 未找到当前标签页')
  }
}

// 监听来自主进程的刷新消息
const handleRefreshMessage = () => {
  refreshCurrentTab()
}

// 🚀 简化的Tab顺序管理
const manageTabOrder = async (path, action) => {
  try {
    if (!window.electronAPI) {
      console.log('⚠️ electronAPI不可用')
      return
    }

    // 获取当前tab顺序数组
    let tabOrder = await window.electronAPI.getConfig('tabOrder') || []
    console.log('📋 TabManager: 当前tab顺序:', tabOrder)

    if (action === 'open') {
      // 打开目录：移除可能存在的历史记录，然后添加到末尾（最新）
      tabOrder = tabOrder.filter(p => p !== path)
      tabOrder.push(path)
      console.log('➕ 添加到tab顺序:', path)
      
    } else if (action === 'switch') {
      // 切换tab：移除可能存在的历史记录，然后添加到末尾（最新）
      tabOrder = tabOrder.filter(p => p !== path)
      tabOrder.push(path)
      console.log('🔄 切换tab顺序:', path)
      
    } else if (action === 'close') {
      // 关闭tab：检查是否还有其他相同路径的tab打开
      const hasOtherOpenTab = tabs.value.some(tab => 
        tab.type === 'home' && 
        tab.props.path === path
      )
      
      if (!hasOtherOpenTab) {
        // 只有当前tab，完全移除
        tabOrder = tabOrder.filter(p => p !== path)
        console.log('❌ 完全移除tab顺序:', path)
      } else {
        console.log('📝 tab仍然有其他实例打开，不移除顺序:', path)
      }
    }

    // 保存更新后的顺序
    await window.electronAPI.setConfig('tabOrder', tabOrder)
    console.log('💾 TabManager: 保存tab顺序:', tabOrder)
  } catch (error) {
    console.error('❌ Tab顺序管理失败:', error)
  }
}

// 🚀 恢复上次关闭时激活的目录
const restoreClonedDirectories = async () => {
  try {
    if (!window.electronAPI) {
      console.log('⚠️ electronAPI不可用')
      return
    }
    
    console.log('🔍 TabManager: 开始恢复tab顺序...')
    
    // 获取保存的tab顺序数组
    const tabOrder = await window.electronAPI.getConfig('tabOrder') || []
    console.log('📋 TabManager: 保存的tab顺序:', tabOrder)
    
    if (tabOrder.length > 0) {
      console.log('🚀 TabManager: 按顺序恢复', tabOrder.length, '个tab...')
      
      // 按顺序恢复所有的tab（最后一个自动成为活跃tab）
      for (let i = 0; i < tabOrder.length; i++) {
        const path = tabOrder[i]
        const pathParts = path.split('/')
        const dirName = pathParts[pathParts.length - 1] || path
        
        console.log(`✅ TabManager: 恢复第${i + 1}个目录:`, dirName, path)
        await openTab('home', dirName, { path: path })
      }
      
      console.log('✅ TabManager: 恢复完成，最后一个恢复的tab将成为活跃tab')
    
    // 如果有恢复的目录，最后定位到最后一个目录
      const lastPath = tabOrder[tabOrder.length - 1]
      const lastTab = tabs.value.find(tab => 
        tab.type === 'home' && tab.props.path === lastPath
      )
      if (lastTab) {
        console.log('✅ TabManager: 最后定位到之前打开的项目目录:', lastPath)
        await switchTab(lastTab.id)
      }
    } else {
      console.log('📋 TabManager: 没有需要恢复的tab')
    }
  } catch (error) {
    console.error('❌ TabManager: 恢复目录失败: ', error)
  }
}

// 初始化
onMounted(async () => {
  console.log('🔍💎💎 TabManager onMounted开始执行')
  
  // 创建初始标签页
  const initialTab = createTab(props.initialTab, '主页')
  activeTabId.value = initialTab.id
  console.log('✅ TabManager: 初始化页面tab已创建, id:', initialTab.id, 'type:', props.initialTab)
  
  // 🚀 在主页下方固定创建浏览器 tab
  console.log('🚀 TabManager: 创建固定的浏览器 tab')
  await openTab('browser', '浏览器', {})
  
  // 🚀 恢复上次关闭时激活的目录
  console.log('🚀💎 TabManager: 准备调用restoreClonedDirectories')
  await restoreClonedDirectories()
  console.log('✅💎 TabManager: restoreClonedDirectories调用完成')
  
  // 监听来自主进程的刷新消息
  if (window.electronAPI) {
    window.electronAPI.onRefreshCurrentTab(handleRefreshMessage)
    console.log('✅ TabManager: 刷新消息监听器已注册')
  }

  console.log('🎉💎 TabManager: onMounted执行完毕')
})

// 清理
onUnmounted(() => {
  if (window.electronAPI) {
    window.electronAPI.removeRefreshCurrentTabListener(handleRefreshMessage)
  }
})

// 暴露方法给父组件
defineExpose({
  openTab,
  switchTab,
  closeTab
})
</script>

<style scoped>
.tab-manager {
  display: flex;
  flex-direction: row; /* 改为横向布局 */
  flex: 1;
  background: #e8e8ed; /* 深一点的背景色 */
}

.tab-bar {
  display: flex;
  flex-direction: column; /* 改为纵向布局 */
  width: 170px; /* 固定宽度，稍微窄一点 */
  min-width: 160px;
  max-width: 240px;
  background: #2d2d30; /* 深色背景 */
  border-right: 1px solid rgba(255, 255, 255, 0.1); /* 右侧边框 */
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

/* 顶部标题区域 */
.tab-bar-header {
  height: 56px; /* 加大高度 */
  display: flex;
  align-items: center;
  justify-content: flex-start; /* 左对齐 */
  padding-top: 32px; /* 再往下一些，与系统菜单间距一致 */
  padding-left: 16px; /* 与 tab 图标对齐（tab-list padding 4px + tab-item padding 12px） */
  padding-right: 12px;
  flex-shrink: 0;
  -webkit-app-region: drag; /* 允许拖拽窗口 */
  position: relative;
  z-index: 1;
}

.tab-bar-title {
  font-size: 18px; /* 调大字号 */
  font-weight: 700; /* 加粗 */
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-app-region: drag; /* 标题区域也支持拖拽 */
}

.tab-list {
  display: flex;
  flex-direction: column; /* 改为纵向布局 */
  flex: 1;
  overflow-y: auto; /* 纵向滚动 */
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  gap: 4px;
  padding: 12px 4px; /* 调整顶部间距，与系统菜单间距一致 */
  min-height: 0; /* 允许 flex 子元素缩小 */
}

.tab-list::-webkit-scrollbar {
  width: 6px;
}

.tab-list::-webkit-scrollbar-track {
  background: transparent;
}

.tab-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.tab-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.tab-item {
  display: flex;
  align-items: center;
  justify-content: flex-start; /* 左对齐 */
  padding: 10px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 44px;
  width: 100%;
  box-sizing: border-box;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  position: relative;
  color: rgba(255, 255, 255, 0.7);
  border-radius: 6px;
  margin-bottom: 2px;
  -webkit-app-region: no-drag; /* 标签页不可拖拽窗口 */
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.tab-item.active {
  background: rgba(255, 255, 255, 0.15); /* 稍微亮一点的深灰色背景 */
  color: rgba(255, 255, 255, 0.95); /* 浅色文字 */
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  z-index: 1;
}

.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  transition: all 0.3s ease;
}

.tab-item:hover .tab-icon {
  color: rgba(255, 255, 255, 0.9);
}

.tab-item.active .tab-icon {
  color: rgba(255, 255, 255, 0.95); /* 浅色图标 */
}

.tab-title {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.3s ease;
  min-width: 0; /* 允许文本截断 */
}

.tab-item:hover .tab-title {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 550;
}

.tab-item.active .tab-title {
  color: rgba(255, 255, 255, 0.95); /* 浅色文字 */
  font-weight: 600;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.3s ease;
  opacity: 0.8;
  flex-shrink: 0;
  margin-left: auto; /* 自动推到右侧 */
  border-radius: 3px;
  -webkit-app-region: no-drag; /* 关闭按钮不可拖拽窗口 */
}

.tab-item.active .tab-close {
  color: rgba(255, 255, 255, 0.7); /* 浅色关闭按钮 */
}

.tab-close:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.1);
  opacity: 1;
  transform: scale(1.1);
}

.tab-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #e8e8ed; /* 和整体背景色一致 */
  min-width: 0; /* 允许内容区域缩小 */
}

.tab-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  height: 100%;
  width: 100%;
}

/* 右侧内容区域顶部拖拽区域（不占用空间） */
.tab-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px; /* 比左侧小一些 */
  -webkit-app-region: drag; /* 允许拖拽窗口 */
  z-index: 10;
  pointer-events: auto;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tab-bar {
    width: 160px;
    min-width: 140px;
    max-width: 200px;
  }
  
  .tab-item {
    min-height: 40px;
    padding: 8px 10px;
    gap: 8px;
    font-size: 13px;
  }
  
  .tab-title {
    font-size: 13px;
  }
  
  .tab-icon {
    width: 16px;
    height: 16px;
  }
  
  .tab-close {
    width: 16px;
    height: 16px;
  }
}

/* 动画效果 */
.tab-item {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 滚动条样式 */
.tab-panel::-webkit-scrollbar {
  width: 8px;
}

.tab-panel::-webkit-scrollbar-track {
  background: rgba(102, 126, 234, 0.05);
  border-radius: 4px;
}

.tab-panel::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.tab-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}
</style>
