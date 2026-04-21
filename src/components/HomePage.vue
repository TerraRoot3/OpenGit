<template>
  <div 
    class="home-page"
    :style="backgroundStyle"
  >
    <!-- 背景图片 -->
    <div 
      v-if="backgroundImage"
      class="background-image"
      :style="backgroundImageStyle"
    ></div>
    
    <!-- 遮罩层 -->
    <div 
      class="background-overlay"
      :style="overlayStyle"
    ></div>
    
    <!-- 内容区域 -->
    <div class="home-content">
      <!-- 设置按钮 -->
      <button class="settings-btn" @click="showSettingsDialog = true" title="设置背景">
        <Settings :size="20" />
      </button>
      
      <!-- 时钟和日期 -->
      <div class="clock-section">
        <div class="clock">{{ currentTime }}</div>
        <div class="date">{{ currentDate }}</div>
      </div>
      
      <!-- 收藏网址网格 -->
      <div class="favorites-grid">
        <!-- 收藏的网址（按排序显示） -->
        <div
          v-for="fav in sortedFavorites"
          :key="fav.id"
          class="favorite-item"
          @click="handleNavigate(fav.url)"
        >
          <div 
            class="favorite-icon"
            :style="getFavoriteIconStyle(fav)"
          >
            <img 
              v-if="hasValidIcon(fav)"
              :src="getIconUrl(fav)"
              :alt="fav.title || getDomainFromUrl(fav.url)"
              @error="() => handleIconError(fav)"
              class="favorite-icon-image"
            />
            <span 
              v-else
              class="favorite-icon-text"
              :class="{ 'text-dark': !fav.customColor || fav.customColor === '#ffffff' || fav.customColor === '#fff' }"
            >
              {{ getFavoriteText(fav) }}
            </span>
          </div>
          <div class="favorite-label">{{ fav.title || getDomainFromUrl(fav.url) }}</div>
        </div>
      </div>
    </div>
    
    <!-- 设置抽屉 -->
    <Transition name="drawer">
      <div v-if="showSettingsDialog" class="settings-drawer-overlay" @click="showSettingsDialog = false">
        <div class="settings-drawer" @click.stop>
          <div class="settings-drawer-header">
            <h3>设置</h3>
            <button class="settings-drawer-close" @click="showSettingsDialog = false">
              <X :size="18" />
            </button>
          </div>
          <div class="settings-drawer-body">
            <!-- 左侧分组列表 -->
            <div class="settings-sidebar">
              <div 
                class="settings-sidebar-item"
                :class="{ active: activeSettingsGroup === 'background' }"
                @click="activeSettingsGroup = 'background'"
              >
                背景设置
              </div>
              <div
                class="settings-sidebar-item"
                :class="{ active: activeSettingsGroup === 'theme' }"
                @click="activeSettingsGroup = 'theme'"
              >
                主题设置
              </div>
            </div>
            
            <!-- 右侧设置内容 -->
            <div class="settings-content">
              <!-- 背景设置 -->
              <div v-if="activeSettingsGroup === 'background'" class="settings-panel">
                <!-- 选择背景图片 -->
                <div class="settings-item">
                  <label>背景图片</label>
                  <div class="settings-item-content">
                    <button class="settings-btn-primary" @click="selectBackgroundImage">
                      {{ backgroundImage ? '更换图片' : '选择图片' }}
                    </button>
                    <button 
                      v-if="backgroundImage"
                      class="settings-btn-secondary"
                      @click="clearBackgroundImage"
                    >
                      清除
                    </button>
                  </div>
                </div>
                
                <!-- 遮罩浓度 -->
                <div class="settings-item">
                  <label>遮罩浓度: {{ overlayOpacity }}%</label>
                  <div class="settings-item-content">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      v-model.number="overlayOpacity"
                      class="settings-slider"
                    />
                  </div>
                </div>
                
                <!-- 模糊度 -->
                <div class="settings-item">
                  <label>模糊度: {{ blurAmount }}px</label>
                  <div class="settings-item-content">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      v-model.number="blurAmount"
                      class="settings-slider"
                    />
                  </div>
                </div>
              </div>

              <div v-else-if="activeSettingsGroup === 'theme'" class="settings-panel">
                <div class="settings-item">
                  <label>界面主题</label>
                  <div class="theme-option-list">
                    <button
                      v-for="theme in themeOptions"
                      :key="theme.id"
                      class="theme-option"
                      :class="{ active: currentTheme === theme.id }"
                      @click="handleThemeChange(theme.id)"
                    >
                      <span class="theme-option-swatch" :class="`theme-swatch-${theme.id}`"></span>
                      <span class="theme-option-meta">
                        <span class="theme-option-name">{{ theme.label }}</span>
                        <span class="theme-option-appearance">{{ themeAppearanceLabel(theme.appearance) }}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Settings, X } from 'lucide-vue-next'
import { useFavorites } from '../composables/useFavorites'
import { useThemeStore } from '../stores/themeStore.js'

const props = defineProps({
  // 是否是新标签页模式（新标签页点击在当前标签打开，首页点击在新标签打开）
  isNewTab: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['navigate', 'navigate-current'])

// 使用收藏 composable
const { favorites, loadFavorites } = useFavorites()
const themeStore = useThemeStore()
const currentTheme = computed(() => themeStore.currentTheme.value)
const themeOptions = computed(() => Object.values(themeStore.themeDefinitions))

// 按排序显示的收藏列表
const sortedFavorites = computed(() => {
  if (!favorites.value || !Array.isArray(favorites.value) || favorites.value.length === 0) {
    return []
  }
  return [...favorites.value].sort((a, b) => {
    // 优先按 sortOrder 排序（如果有的话）
    const orderA = a.sortOrder !== undefined ? a.sortOrder : 9999
    const orderB = b.sortOrder !== undefined ? b.sortOrder : 9999
    if (orderA !== orderB) {
      return orderA - orderB
    }
    // 如果没有 sortOrder，按创建时间排序
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })
})


// 背景设置 - 从 localStorage 同步读取缓存，避免闪烁
const getLocalCache = () => {
  try {
    const cached = localStorage.getItem('homePageBackgroundCache')
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (e) {}
  return null
}
const localCache = getLocalCache()
const backgroundImage = ref(localCache?.image || '')
const overlayOpacity = ref(localCache?.overlayOpacity ?? 30) // 遮罩浓度 0-100
const blurAmount = ref(localCache?.blurAmount ?? 5) // 模糊度 0-20px

// 设置弹框
const showSettingsDialog = ref(false)
const activeSettingsGroup = ref('background')

// 图标错误状态
const iconErrors = ref({})

// 时间
const currentTime = ref('')
const currentDate = ref('')

// 计算背景样式
const backgroundStyle = computed(() => {
  return {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'auto'
  }
})

// 计算背景图片样式
const backgroundImageStyle = computed(() => {
  const styles = {
    backgroundImage: `url(${backgroundImage.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
  
  if (blurAmount.value > 0) {
    styles.filter = `blur(${blurAmount.value}px)`
  }
  
  return styles
})

// 计算遮罩样式
const overlayStyle = computed(() => {
  // 如果有背景图片，使用黑色遮罩；否则使用深灰色背景
  if (backgroundImage.value) {
    return {
      backgroundColor: `rgba(0, 0, 0, ${overlayOpacity.value / 100})`
    }
  }
  // 没有背景图片时，使用深灰色背景（不透明）
  return {
    backgroundColor: '#2d2d2d'
  }
})

// 更新时钟
const updateClock = () => {
  const now = new Date()
  
  // 时间格式：HH:MM:SS
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  currentTime.value = `${hours}:${minutes}:${seconds}`
  
  // 日期格式：12月3日 星期三 十月十四
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const weekday = weekdays[now.getDay()]
  
  // 农历日期（简化版，实际应该使用农历库）
  currentDate.value = `${month}月${day}日 ${weekday}`
}

let clockInterval = null

// 选择背景图片
const selectBackgroundImage = async () => {
  try {
    if (window.electronAPI && window.electronAPI.showOpenDialog) {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile'],
        title: '选择背景图片',
        filters: [
          { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
        ]
      })
      
      if (!result.canceled && result.filePaths.length > 0) {
        const imagePath = result.filePaths[0]
        // 读取图片并转换为 base64
        if (window.electronAPI.readImageAsBase64) {
          const imageResult = await window.electronAPI.readImageAsBase64(imagePath)
          if (imageResult.success) {
            backgroundImage.value = imageResult.dataUrl
            saveSettings()
          } else {
            console.error('读取图片失败:', imageResult.error)
          }
        }
      }
    }
  } catch (error) {
    console.error('选择背景图片失败:', error)
  }
}

// 清除背景图片
const clearBackgroundImage = () => {
  backgroundImage.value = ''
  saveSettings()
}

// 保存设置
const saveSettings = async () => {
  try {
    const settingsData = {
      image: backgroundImage.value,
      overlayOpacity: overlayOpacity.value,
      blurAmount: blurAmount.value
    }
    
    // 同步保存到 localStorage 用于快速加载
    try {
      localStorage.setItem('homePageBackgroundCache', JSON.stringify(settingsData))
    } catch (e) {}
    
    // 异步保存到 electron store
    if (window.electronAPI && window.electronAPI.saveConfig) {
      await window.electronAPI.saveConfig({
        key: 'homePageBackground',
        value: settingsData
      })
      console.log('✅ 背景设置已保存')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}

// 加载设置
const loadSettings = async () => {
  try {
    if (window.electronAPI && window.electronAPI.getConfig) {
      const result = await window.electronAPI.getConfig('homePageBackground')
      // getConfig 直接返回 { value: ... } 或者直接返回值
      const config = result?.value || result

      if (config) {
        let image = config.image || ''

        // 如果是旧的 file:// 路径，转换为 base64
        if (image.startsWith('file://') && window.electronAPI.readImageAsBase64) {
          const filePath = image.replace('file://', '')
          const imageResult = await window.electronAPI.readImageAsBase64(filePath)
          if (imageResult.success) {
            image = imageResult.dataUrl
            // 更新配置为新格式
            await window.electronAPI.saveConfig({
              key: 'homePageBackground',
              value: {
                image,
                overlayOpacity: config.overlayOpacity ?? 30,
                blurAmount: config.blurAmount ?? 5
              }
            })
          } else {
            console.warn('加载背景图片失败，可能文件已被移动或删除:', imageResult.error)
            image = ''
          }
        }

        // 只有当数据与缓存不同时才更新（避免闪烁）
        if (image !== backgroundImage.value) {
          backgroundImage.value = image
        }
        if (config.overlayOpacity !== undefined && config.overlayOpacity !== overlayOpacity.value) {
          overlayOpacity.value = config.overlayOpacity
        }
        if (config.blurAmount !== undefined && config.blurAmount !== blurAmount.value) {
          blurAmount.value = config.blurAmount
        }
        
        // 更新 localStorage 缓存
        try {
          localStorage.setItem('homePageBackgroundCache', JSON.stringify({
            image,
            overlayOpacity: overlayOpacity.value,
            blurAmount: blurAmount.value
          }))
        } catch (e) {}
        
        console.log('✅ 背景设置已加载:', { hasImage: !!image, overlayOpacity: overlayOpacity.value, blurAmount: blurAmount.value })
      }
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 监听设置变化
watch([overlayOpacity, blurAmount], () => {
  saveSettings()
})

// 收藏相关函数
const hasValidIcon = (fav) => {
  const hasError = iconErrors.value && iconErrors.value[fav.id]
  return !!(fav.icon && !hasError)
}

const getIconUrl = (fav) => {
  return fav.icon
}

const handleIconError = (fav) => {
  if (!iconErrors.value) {
    iconErrors.value = {}
  }
  iconErrors.value[fav.id] = true
}

const getDomainFromUrl = (url) => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch (e) {
    return ''
  }
}

const getFavoriteText = (fav) => {
  return (fav.title || getDomainFromUrl(fav.url) || '收藏').charAt(0).toUpperCase()
}

// 生成基于域名的固定颜色
const generateColorFromDomain = (domain) => {
  if (!domain) domain = 'default'
  
  let hash = 0
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const colors = [
    '#f97316', '#ea580c', '#c2410c', '#fb923c', '#f59e0b',
    '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
    '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e',
    '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d',
    '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
    '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12',
    '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e',
    '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87',
    '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
    '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
    '#d97706', '#b45309', '#92400e', '#78350f', '#713f12',
    '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827'
  ]
  
  return colors[Math.abs(hash) % colors.length]
}

const getFavoriteIconStyle = (fav) => {
  if (hasValidIcon(fav)) {
    return {}
  }
  
  // 优先使用收藏里设置的图标背景色，没有设置的默认白色
  const color = fav.customColor || '#ffffff'
  return {
    background: color
  }
}

const handleNavigate = (url) => {
  if (props.isNewTab) {
    // 新标签页模式：在当前标签打开
    emit('navigate-current', url)
  } else {
    // 首页模式：在新标签打开
  emit('navigate', url)
  }
}

const handleThemeChange = (themeId) => {
  themeStore.setTheme(themeId)
}

const themeAppearanceLabel = (appearance) => {
  if (appearance === 'dark') return '深色主题'
  if (appearance === 'light') return '浅色主题'
  return '主题'
}


// 标记是否已初始化
const isInitialized = ref(false)

onMounted(async () => {
  console.log('🏠 HomePage 组件已挂载')
  console.log('🏠 HomePage DOM 元素:', document.querySelector('.home-page'))
  
  // 只在首次挂载时初始化
  if (!isInitialized.value) {
    updateClock()
    clockInterval = setInterval(updateClock, 1000)
    await loadSettings()
    await loadFavorites()
    isInitialized.value = true
    console.log('🏠 HomePage 首次初始化完成')
  } else {
    console.log('🏠 HomePage 已初始化，跳过数据加载')
  }
  console.log('🏠 HomePage 收藏数量:', favorites.value?.length || 0)
  console.log('🏠 HomePage 当前时间:', currentTime.value)
  console.log('🏠 HomePage 当前日期:', currentDate.value)
  console.log('🏠 HomePage 背景图片:', backgroundImage.value ? '已设置' : '未设置')
  console.log('🏠 HomePage 遮罩浓度:', overlayOpacity.value)
  console.log('🏠 HomePage 模糊度:', blurAmount.value)
  
  // 确保内容可见
  nextTick(() => {
    const homePage = document.querySelector('.home-page')
    const homeContent = document.querySelector('.home-content')
    console.log('🏠 HomePage DOM 检查:', {
      homePage: !!homePage,
      homeContent: !!homeContent,
      homePageDisplay: homePage ? window.getComputedStyle(homePage).display : 'null',
      homePageVisibility: homePage ? window.getComputedStyle(homePage).visibility : 'null',
      homePageZIndex: homePage ? window.getComputedStyle(homePage).zIndex : 'null',
      homeContentDisplay: homeContent ? window.getComputedStyle(homeContent).display : 'null'
    })
  })
})

onUnmounted(() => {
  if (clockInterval) {
    clearInterval(clockInterval)
  }
})
</script>

<style scoped>
.home-page {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  z-index: 100;
  /* 确保可见 */
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.background-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transition: filter 0.3s ease;
}

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  transition: background-color 0.3s ease;
  /* 如果没有背景图片，使用深灰色背景 */
  background: #2d2d2d;
}

.home-content {
  position: relative;
  z-index: 100;
  width: 100%;
  min-height: 100%;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  /* 确保可见 */
  visibility: visible;
  opacity: 1;
}

.settings-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
  z-index: 10;
}

.settings-btn:hover {
  color: rgba(255, 255, 255, 0.9);
  transform: scale(1.1);
}

.clock-section {
  text-align: center;
  margin-bottom: 60px;
  margin-top: 40px;
}

.clock {
  font-size: 72px;
  font-weight: 300;
  color: #fff;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.date {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
}

.favorites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 24px;
  width: 100%;
  max-width: 1200px;
  padding: 0 20px;
}

/* 确保收藏项可以容纳完整文本 */
.favorite-item {
  min-width: 0; /* 允许 flex 子元素缩小 */
  width: 100%;
}

.favorite-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s;
}

.favorite-item:hover {
  transform: translateY(-4px);
}

.favorite-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.favorite-item:hover .favorite-icon {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.favorite-icon-image {
  width: auto;
  height: auto;
  max-width: 60%;
  max-height: 60%;
  object-fit: contain;
  border-radius: 8px;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

.favorite-icon-text {
  font-size: 32px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  user-select: none;
}

.favorite-icon-text.text-dark {
  color: #333;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
}

.favorite-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  width: 100%;
  white-space: normal;
  word-wrap: break-word;
  word-break: break-word;
  line-height: 1.4;
  overflow: visible;
}

/* 设置抽屉 */
.settings-drawer-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  z-index: 10000;
}

.settings-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  background: rgba(30, 30, 30, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.settings-drawer-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.settings-drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.settings-drawer-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.settings-drawer-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.settings-drawer-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 左侧分组列表 */
.settings-sidebar {
  width: 76px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0;
  overflow-y: auto;
}

.settings-sidebar-item {
  padding: 10px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.settings-sidebar-item:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.05);
}

.settings-sidebar-item.active {
  color: #667eea;
  background: rgba(102, 126, 234, 0.15);
}

/* 右侧设置内容 */
.settings-content {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
}

.settings-panel {
  /* 设置面板容器 */
}

.theme-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.theme-option {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.88);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.theme-option:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
  transform: translateY(-1px);
}

.theme-option.active {
  background: color-mix(in srgb, var(--theme-comp-sidebar-item-active-bg) 82%, transparent);
  border-color: var(--theme-comp-sidebar-item-active-border);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.theme-option-swatch {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.theme-swatch-slate-dual {
  background: linear-gradient(135deg, #14171c 0%, #242931 52%, #4f8cff 100%);
}

.theme-swatch-graphite-moss {
  background: linear-gradient(135deg, #121613 0%, #2c342e 52%, #4e8f64 100%);
}

.theme-option-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.theme-option-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.theme-option-appearance {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.56);
}

/* 抽屉动画 */
.drawer-enter-active .settings-drawer,
.drawer-leave-active .settings-drawer {
  transition: transform 0.3s ease;
}

.drawer-enter-from .settings-drawer,
.drawer-leave-to .settings-drawer {
  transform: translateX(100%);
}

.settings-item {
  margin-bottom: 16px;
}

.settings-item:last-child {
  margin-bottom: 0;
}

.settings-item label {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.settings-item-content {
  display: flex;
  gap: 12px;
  align-items: center;
}

.settings-btn-primary {
  padding: 8px 16px;
  border: 1px solid #667eea;
  border-radius: 6px;
  background: #667eea;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn-primary:hover {
  background: #5568d3;
  border-color: #5568d3;
}

.settings-btn-secondary {
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: #3d3d3d;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn-secondary:hover {
  background: #4d4d4d;
  border-color: rgba(255, 255, 255, 0.3);
}

.settings-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
  -webkit-appearance: none;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-slider::-webkit-slider-thumb:hover {
  background: #5568d3;
  transform: scale(1.1);
}

.settings-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.settings-slider::-moz-range-thumb:hover {
  background: #5568d3;
  transform: scale(1.1);
}
</style>
