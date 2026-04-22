<template>
  <div
    class="home-page"
    :class="{ 'home-page--light-theme': isLightTheme }"
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
              :class="{ 'text-dark': shouldUseDarkFavoriteText(fav) }"
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
              <div
                class="settings-sidebar-item"
                :class="{ active: activeSettingsGroup === 'diagnostics' }"
                @click="activeSettingsGroup = 'diagnostics'"
              >
                诊断
              </div>
            </div>
            
            <!-- 右侧设置内容 -->
            <div class="settings-content">
              <!-- 背景设置 -->
              <div v-if="activeSettingsGroup === 'background'" class="settings-panel">
                <div class="settings-item">
                  <label>背景来源</label>
                  <div class="source-toggle">
                    <button
                      class="source-toggle-btn"
                      :class="{ active: backgroundMode === 'local' }"
                      @click="setBackgroundMode('local')"
                    >
                      本地图片
                    </button>
                    <button
                      class="source-toggle-btn"
                      :class="{ active: backgroundMode === 'online' }"
                      @click="setBackgroundMode('online')"
                    >
                      在线壁纸
                    </button>
                  </div>
                </div>

                <!-- 选择背景图片 -->
                <div v-if="backgroundMode === 'local'" class="settings-item">
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

                <div v-else class="settings-item">
                  <label>在线壁纸</label>
                  <div class="settings-item-content settings-item-content--stack">
                    <div class="online-wallpaper-summary">
                      <div class="online-wallpaper-summary-main">
                        <span class="online-wallpaper-summary-label">当前来源</span>
                        <span class="online-wallpaper-summary-value">
                          {{ currentOnlineProviderLabel }}
                        </span>
                      </div>
                      <div class="online-wallpaper-summary-main">
                        <span class="online-wallpaper-summary-label">当前壁纸</span>
                        <span class="online-wallpaper-summary-value">
                          {{ onlineWallpaper.title || '未选择在线壁纸' }}
                        </span>
                      </div>
                    </div>
                    <label class="settings-switch">
                      <input
                        type="checkbox"
                        :checked="onlineWallpaper.autoUpdateLatest"
                        @change="toggleAutoUpdateLatest"
                      />
                      <span>自动更新到最新壁纸</span>
                    </label>
                    <div class="settings-item-content">
                      <button class="settings-btn-primary" @click="openOnlineWallpaperDialog">
                        选择在线壁纸
                      </button>
                      <button class="settings-btn-secondary" @click="refreshOnlineWallpaperList" :disabled="onlineWallpaperLoading">
                        {{ onlineWallpaperLoading ? '加载中...' : '刷新来源' }}
                      </button>
                    </div>
                    <div v-if="onlineWallpaperError" class="online-wallpaper-error">{{ onlineWallpaperError }}</div>
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

              <div v-else-if="activeSettingsGroup === 'diagnostics'" class="settings-panel">
                <div class="diagnostics-toolbar">
                  <button class="settings-btn-primary" :disabled="diagnosticsLoading" @click="refreshDiagnostics">
                    {{ diagnosticsLoading ? '刷新中...' : '刷新' }}
                  </button>
                  <button class="settings-btn-secondary" :disabled="!diagnosticsSnapshot" @click="copyDiagnostics">
                    复制诊断信息
                  </button>
                </div>

                <div class="diagnostics-meta">
                  <span>上次刷新: {{ diagnosticsLastUpdated || '未刷新' }}</span>
                  <span v-if="diagnosticsError" class="diagnostics-error">{{ diagnosticsError }}</span>
                </div>

                <div v-if="diagnosticsSnapshot" class="diagnostics-section">
                  <div class="diagnostics-section-title">主进程</div>
                  <div class="diagnostics-grid">
                    <div v-for="item in mainDiagnosticsItems" :key="item.key" class="diagnostics-card">
                      <div class="diagnostics-card-label">{{ item.label }}</div>
                      <div class="diagnostics-card-value">{{ item.value }}</div>
                      <div class="diagnostics-card-desc">{{ item.description }}</div>
                    </div>
                  </div>
                </div>

                <div v-if="diagnosticsSnapshot" class="diagnostics-section">
                  <div class="diagnostics-section-title">渲染层</div>
                  <div class="diagnostics-grid">
                    <div v-for="item in rendererDiagnosticsItems" :key="item.key" class="diagnostics-card">
                      <div class="diagnostics-card-label">{{ item.label }}</div>
                      <div class="diagnostics-card-value">{{ item.value }}</div>
                      <div class="diagnostics-card-desc">{{ item.description }}</div>
                    </div>
                  </div>
                </div>

                <pre v-if="diagnosticsSnapshot" class="diagnostics-json">{{ diagnosticsJson }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="drawer">
      <div
        v-if="showOnlineWallpaperDialog"
        class="online-wallpaper-dialog-overlay"
        @click="closeOnlineWallpaperDialog"
      >
        <div class="online-wallpaper-dialog" @click.stop>
          <div class="online-wallpaper-dialog-header">
            <div class="online-wallpaper-dialog-title">
              <h3>在线壁纸</h3>
              <span>{{ currentOnlineProviderLabel }}</span>
            </div>
            <button class="settings-drawer-close" @click="closeOnlineWallpaperDialog">
              <X :size="18" />
            </button>
          </div>

          <div class="online-wallpaper-dialog-toolbar">
            <div class="provider-chip-list">
              <button
                v-for="provider in onlineWallpaperProviders"
                :key="provider.id"
                class="provider-chip"
                :class="{ active: selectedOnlineProviderId === provider.id }"
                @click="selectOnlineProvider(provider.id)"
              >
                {{ provider.label }}
              </button>
            </div>
            <button class="settings-btn-secondary" @click="refreshOnlineWallpaperList(true)" :disabled="onlineWallpaperLoading">
              {{ onlineWallpaperLoading ? '加载中...' : '刷新列表' }}
            </button>
          </div>

          <div class="online-wallpaper-dialog-body">
            <div v-if="onlineWallpaperError" class="online-wallpaper-error online-wallpaper-error--panel">
              {{ onlineWallpaperError }}
            </div>

            <div class="online-wallpaper-grid online-wallpaper-grid--dialog">
              <button
                v-for="item in onlineWallpaperItems"
                :key="item.id"
                class="online-wallpaper-card"
                :class="{ active: onlineWallpaper.itemId === item.id }"
                @click="applyOnlineWallpaper(item)"
              >
                <span
                  class="online-wallpaper-card-preview"
                  :style="{ backgroundImage: `url(${item.previewUrl})` }"
                ></span>
                <span class="online-wallpaper-card-meta">
                  <span class="online-wallpaper-card-title">{{ item.title }}</span>
                  <span class="online-wallpaper-card-date">{{ item.date || item.attribution }}</span>
                </span>
              </button>
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
import {
  DEFAULT_WALLPAPER_PROVIDER_ID,
  createDefaultHomeBackgroundSettings,
  normalizeHomeBackgroundSettings,
  normalizeOnlineWallpaperSettings
} from './home/wallpaperProviders/registry.mjs'

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
const isLightTheme = computed(() => {
  return themeStore.themeDefinitions[currentTheme.value]?.appearance === 'light'
})

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
      return normalizeHomeBackgroundSettings(JSON.parse(cached))
    }
  } catch (e) {}
  return createDefaultHomeBackgroundSettings()
}
const localCache = getLocalCache()
const backgroundImage = ref(localCache.image || '')
const backgroundMode = ref(localCache.mode || 'local')
const localImagePath = ref(localCache.localImagePath || '')
const onlineWallpaper = ref(normalizeOnlineWallpaperSettings(localCache.online || {}))
const selectedOnlineProviderId = ref(onlineWallpaper.value.providerId || DEFAULT_WALLPAPER_PROVIDER_ID)
const onlineWallpaperProviders = ref([])
const onlineWallpaperItems = ref([])
const onlineWallpaperLoading = ref(false)
const onlineWallpaperError = ref('')
const showOnlineWallpaperDialog = ref(false)
const ONLINE_WALLPAPER_PAGE_SIZE = 8
const overlayOpacity = ref(localCache.overlayOpacity ?? 30) // 遮罩浓度 0-100
const blurAmount = ref(localCache.blurAmount ?? 5) // 模糊度 0-20px

// 设置弹框
const showSettingsDialog = ref(false)
const activeSettingsGroup = ref('background')
const diagnosticsLoading = ref(false)
const diagnosticsSnapshot = ref(null)
const diagnosticsLastUpdated = ref('')
const diagnosticsError = ref('')

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
    overflow: 'auto',
    background: 'linear-gradient(180deg, var(--theme-sem-bg-app) 0%, var(--theme-sem-bg-workspace) 100%)'
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
  if (backgroundImage.value) {
    return {
      backgroundColor: 'var(--theme-sem-bg-overlay)',
      opacity: overlayOpacity.value / 100
    }
  }

  return {
    background: 'linear-gradient(180deg, var(--theme-sem-bg-app) 0%, var(--theme-sem-bg-workspace) 100%)',
    opacity: 1
  }
})

const currentOnlineProviderLabel = computed(() => {
  return onlineWallpaperProviders.value.find((item) => item.id === selectedOnlineProviderId.value)?.label
    || '在线壁纸'
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
            backgroundMode.value = 'local'
            localImagePath.value = imagePath
            backgroundImage.value = imageResult.dataUrl
            await saveSettings()
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
  localImagePath.value = ''
  onlineWallpaper.value = normalizeOnlineWallpaperSettings({
    ...onlineWallpaper.value,
    itemId: '',
    title: '',
    previewUrl: '',
    remoteUrl: '',
    cachedFilePath: '',
    cachedDataUrl: ''
  })
  saveSettings()
}

const buildSettingsPayload = () => ({
  mode: backgroundMode.value,
  image: backgroundImage.value,
  overlayOpacity: overlayOpacity.value,
  blurAmount: blurAmount.value,
  localImagePath: localImagePath.value,
  online: normalizeOnlineWallpaperSettings(onlineWallpaper.value)
})

const applySettingsPayload = (payload) => {
  const normalized = normalizeHomeBackgroundSettings(payload || {})
  backgroundImage.value = normalized.image || ''
  backgroundMode.value = normalized.mode
  localImagePath.value = normalized.localImagePath || ''
  onlineWallpaper.value = normalizeOnlineWallpaperSettings(normalized.online || {})
  selectedOnlineProviderId.value = onlineWallpaper.value.providerId || DEFAULT_WALLPAPER_PROVIDER_ID
  overlayOpacity.value = normalized.overlayOpacity
  blurAmount.value = normalized.blurAmount
  return normalized
}

const updateLocalBackgroundCache = (payload) => {
  try {
    localStorage.setItem('homePageBackgroundCache', JSON.stringify(payload))
  } catch (e) {}
}

// 保存设置
const saveSettings = async (payload = buildSettingsPayload()) => {
  try {
    const settingsData = normalizeHomeBackgroundSettings(payload)
    updateLocalBackgroundCache(settingsData)
    
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
      const config = normalizeHomeBackgroundSettings(result?.value || result || {})

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
              value: normalizeHomeBackgroundSettings({
                ...config,
                image,
                mode: 'local',
                localImagePath: filePath
              })
            })
          } else {
            console.warn('加载背景图片失败，可能文件已被移动或删除:', imageResult.error)
            image = ''
          }
        }

        applySettingsPayload({
          ...config,
          image
        })
        const settingsData = buildSettingsPayload()
        updateLocalBackgroundCache(settingsData)
        
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

watch([showSettingsDialog, activeSettingsGroup], async ([visible, group]) => {
  if (visible && group === 'diagnostics' && !diagnosticsSnapshot.value && !diagnosticsLoading.value) {
    await nextTick()
    refreshDiagnostics()
  }
  if (visible && group === 'background' && backgroundMode.value === 'online' && !onlineWallpaperItems.value.length && !onlineWallpaperLoading.value) {
    await loadOnlineWallpaperList()
  }
})

const loadOnlineWallpaperProviders = async () => {
  if (!window.electronAPI?.listOnlineWallpaperProviders) return
  const result = await window.electronAPI.listOnlineWallpaperProviders()
  onlineWallpaperProviders.value = Array.isArray(result?.providers) ? result.providers : []
}

const loadOnlineWallpaperList = async (providerId = selectedOnlineProviderId.value, resetLimit = false) => {
  if (!window.electronAPI?.getOnlineWallpaperList || !providerId) return
  onlineWallpaperLoading.value = true
  onlineWallpaperError.value = ''
  try {
    const result = await window.electronAPI.getOnlineWallpaperList({
      providerId,
      options: {
        market: onlineWallpaper.value.market,
        offset: 0,
        limit: ONLINE_WALLPAPER_PAGE_SIZE * 2
      }
    })
    if (!result?.success) {
      onlineWallpaperError.value = result?.error || '读取在线壁纸失败'
      onlineWallpaperItems.value = []
      return
    }
    onlineWallpaperItems.value = Array.isArray(result.items)
      ? result.items.map((item) => ({
        id: item.id || '',
        title: item.title || '',
        subtitle: item.subtitle || '',
        date: item.date || '',
        previewUrl: item.previewUrl || '',
        downloadUrl: item.downloadUrl || '',
        fallbackDownloadUrl: item.fallbackDownloadUrl || '',
        attribution: item.attribution || '',
        market: item.market || onlineWallpaper.value.market
      }))
      : []
  } catch (error) {
    onlineWallpaperError.value = error?.message || '读取在线壁纸失败'
    onlineWallpaperItems.value = []
  } finally {
    onlineWallpaperLoading.value = false
  }
}

const setBackgroundMode = async (mode) => {
  backgroundMode.value = mode === 'online' ? 'online' : 'local'
  if (backgroundMode.value === 'online') {
    if (!onlineWallpaperProviders.value.length) {
      await loadOnlineWallpaperProviders()
    }
    if (!onlineWallpaperItems.value.length) {
      await loadOnlineWallpaperList()
    }
  }
  await saveSettings()
}

const openOnlineWallpaperDialog = async () => {
  showOnlineWallpaperDialog.value = true
  if (!onlineWallpaperProviders.value.length) {
    await loadOnlineWallpaperProviders()
  }
  await loadOnlineWallpaperList(selectedOnlineProviderId.value, true)
}

const closeOnlineWallpaperDialog = () => {
  showOnlineWallpaperDialog.value = false
}

const selectOnlineProvider = async (providerId) => {
  selectedOnlineProviderId.value = providerId
  onlineWallpaper.value = normalizeOnlineWallpaperSettings({
    ...onlineWallpaper.value,
      providerId
    })
  await loadOnlineWallpaperList(providerId, true)
  await saveSettings()
}

const applyOnlineWallpaper = async (item) => {
  if (!item || !window.electronAPI?.downloadOnlineWallpaper) return
  onlineWallpaperLoading.value = true
  onlineWallpaperError.value = ''
  try {
    const payloadItem = {
      id: item.id || '',
      title: item.title || '',
      subtitle: item.subtitle || '',
      date: item.date || '',
      previewUrl: item.previewUrl || '',
      downloadUrl: item.downloadUrl || '',
      fallbackDownloadUrl: item.fallbackDownloadUrl || '',
      attribution: item.attribution || '',
      market: item.market || onlineWallpaper.value.market
    }
    const result = await window.electronAPI.downloadOnlineWallpaper({
      providerId: selectedOnlineProviderId.value,
      item: payloadItem
    })
    if (!result?.success) {
      onlineWallpaperError.value = result?.error || '下载在线壁纸失败'
      return
    }
    backgroundMode.value = 'online'
    backgroundImage.value = result.cachedDataUrl || backgroundImage.value
    onlineWallpaper.value = normalizeOnlineWallpaperSettings({
      ...onlineWallpaper.value,
      providerId: selectedOnlineProviderId.value,
      itemId: payloadItem.id,
      title: payloadItem.title,
      previewUrl: payloadItem.previewUrl,
      remoteUrl: result.remoteUrl || payloadItem.downloadUrl,
      cachedFilePath: result.cachedFilePath,
      cachedDataUrl: result.cachedDataUrl || '',
      market: payloadItem.market || onlineWallpaper.value.market
    })
    await saveSettings()
    closeOnlineWallpaperDialog()
  } catch (error) {
    onlineWallpaperError.value = error?.message || '下载在线壁纸失败'
  } finally {
    onlineWallpaperLoading.value = false
  }
}

const toggleAutoUpdateLatest = async (event) => {
  onlineWallpaper.value = normalizeOnlineWallpaperSettings({
    ...onlineWallpaper.value,
    autoUpdateLatest: !!event?.target?.checked
  })
  await saveSettings()
}

const refreshOnlineWallpaperList = async () => {
  await loadOnlineWallpaperList(selectedOnlineProviderId.value, true)
}

const refreshOnlineWallpaperIfNeeded = async (force = false) => {
  if (!window.electronAPI?.refreshOnlineWallpaperIfNeeded) return
  const settings = buildSettingsPayload()
  if (settings.mode !== 'online') return
  const result = await window.electronAPI.refreshOnlineWallpaperIfNeeded({
    config: settings,
    force
  })
  if (result?.success && result?.config) {
    applySettingsPayload(result.config)
    updateLocalBackgroundCache(buildSettingsPayload())
    if (result.updated) {
      await saveSettings(buildSettingsPayload())
      await loadOnlineWallpaperList(selectedOnlineProviderId.value)
    } else if (result.reason === 'already-latest') {
      await saveSettings(buildSettingsPayload())
    }
  } else if (!result?.success && result?.error) {
    onlineWallpaperError.value = result.error
  }
}

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
  
  // 无自定义颜色时，根据主题外观切换默认背景，避免浅色主题下出现大块纯白。
  const color = fav.customColor || (isLightTheme.value ? 'var(--theme-sem-surface-2)' : '#ffffff')
  return {
    background: color
  }
}

const shouldUseDarkFavoriteText = (fav) => {
  if (!fav?.customColor) {
    return true
  }

  const normalizedColor = String(fav.customColor).trim().toLowerCase()
  return normalizedColor === '#ffffff' || normalizedColor === '#fff' || normalizedColor === 'white'
}

const formatBytes = (bytes) => {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let current = value
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }
  const precision = current >= 100 || unitIndex === 0 ? 0 : 1
  return `${current.toFixed(precision)} ${units[unitIndex]}`
}

const formatDiagnosticValue = (value, formatter = null) => {
  if (formatter) return formatter(value)
  if (value === '' || value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

const diagnosticsJson = computed(() => {
  if (!diagnosticsSnapshot.value) return ''
  return JSON.stringify(diagnosticsSnapshot.value, null, 2)
})

const mainDiagnosticsItems = computed(() => {
  const main = diagnosticsSnapshot.value?.main
  if (!main) return []
  return [
    {
      key: 'web-tabs-views',
      label: 'Web tab views',
      value: formatDiagnosticValue(main.webTabs?.views),
      description: '主进程仍持有的 WebContentsView 数量'
    },
    {
      key: 'web-tabs-recovery',
      label: 'Recovery meta',
      value: formatDiagnosticValue(main.webTabs?.recoveryMeta),
      description: 'tab 恢复元数据数量，关页后应回落'
    },
    {
      key: 'web-tabs-contents',
      label: 'Contents map',
      value: formatDiagnosticValue(main.webTabs?.contentsToTab),
      description: 'webContents.id 到 tabId 的映射数量'
    },
    {
      key: 'web-tabs-lifecycle',
      label: 'Lifecycle tracked',
      value: formatDiagnosticValue(main.webTabs?.lifecycleTracked),
      description: '生命周期控制器正在跟踪的 tab 数'
    },
    {
      key: 'permissions-callbacks',
      label: 'Pending callbacks',
      value: formatDiagnosticValue(main.permissions?.pendingCallbacks),
      description: '待响应权限请求 callback 数量'
    },
    {
      key: 'permissions-timeouts',
      label: 'Pending timeouts',
      value: formatDiagnosticValue(main.permissions?.pendingTimeouts),
      description: '待清理权限请求 timeout 数量'
    },
    {
      key: 'floating-menu-resolvers',
      label: 'Floating resolvers',
      value: formatDiagnosticValue(main.floatingMenus?.resolvers),
      description: '原生浮层菜单 Promise resolver 数量'
    },
    {
      key: 'downloads-history',
      label: 'Download history',
      value: formatDiagnosticValue(main.downloads?.history),
      description: '下载历史条目数，属于持久保留'
    }
  ]
})

const rendererDiagnosticsItems = computed(() => {
  const renderer = diagnosticsSnapshot.value?.renderer
  const browser = renderer?.browser
  const projectDetail = renderer?.projectDetail
  const projectStore = renderer?.projectStore
  const workspaceEditor = renderer?.workspaceEditor
  const terminals = renderer?.providers?.terminals
  const jsHeap = renderer?.jsHeap
  return [
    {
      key: 'browser-total-tabs',
      label: 'Browser tabs',
      value: formatDiagnosticValue(browser?.totalTabs),
      description: '当前 Vue 浏览器标签总数'
    },
    {
      key: 'browser-project-tabs',
      label: 'Project tabs',
      value: formatDiagnosticValue(browser?.projectTabCount),
      description: '其中属于仓库详情的标签页数量'
    },
    {
      key: 'project-detail-instances',
      label: 'ProjectDetail instances',
      value: formatDiagnosticValue(projectDetail?.instances),
      description: '当前挂载中的 ProjectDetail 实例数'
    },
    {
      key: 'project-detail-inactive-heavy',
      label: 'Inactive heavy pages',
      value: formatDiagnosticValue(projectDetail?.inactiveHeavyInstances),
      description: '后台项目页里仍挂着重子页的实例数'
    },
    {
      key: 'workspace-mounted-count',
      label: 'Workspace mounted',
      value: formatDiagnosticValue(projectDetail?.workspaceMountedCount),
      description: '已挂载工作区子页的项目页数量'
    },
    {
      key: 'terminal-mounted-count',
      label: 'Terminal mounted',
      value: formatDiagnosticValue(projectDetail?.terminalMountedCount),
      description: '已挂载终端子页的项目页数量'
    },
    {
      key: 'ai-mounted-count',
      label: 'AI sessions mounted',
      value: formatDiagnosticValue(projectDetail?.aiSessionsMountedCount),
      description: '已挂载 AI 会话子页的项目页数量'
    },
    {
      key: 'project-store-details',
      label: 'Project store details',
      value: formatDiagnosticValue(projectStore?.projectDetails),
      description: 'projectStore 中缓存的项目详情对象数'
    },
    {
      key: 'project-store-branch-status',
      label: 'Branch status cache',
      value: formatDiagnosticValue(projectStore?.branchStatusCache),
      description: 'projectStore 中分支状态缓存数'
    },
    {
      key: 'workspace-editor-sessions',
      label: 'Workspace editor sessions',
      value: formatDiagnosticValue(workspaceEditor?.sessions),
      description: '共享 Monaco session 数量，按项目路径分组'
    },
    {
      key: 'workspace-editor-live',
      label: 'Live Monaco editors',
      value: formatDiagnosticValue(workspaceEditor?.liveEditors),
      description: '当前仍存活的 Monaco editor 实例数'
    },
    {
      key: 'workspace-editor-models',
      label: 'Workspace models',
      value: formatDiagnosticValue(workspaceEditor?.modelCount),
      description: '共享缓存中的文本 model 数量'
    },
    {
      key: 'terminal-router-handlers',
      label: 'Terminal handlers',
      value: formatDiagnosticValue(renderer?.terminalRouter?.handlerCount),
      description: '终端路由全局 handler 数，关终端页后应尽量回落'
    },
    {
      key: 'terminal-live-panels',
      label: 'Live terminal panels',
      value: formatDiagnosticValue(terminals?.livePanels),
      description: '当前真正挂载的 TerminalPanel 实例数'
    },
    {
      key: 'terminal-focus-sessions',
      label: 'Liquid terminal sessions',
      value: formatDiagnosticValue(terminals?.focusSessions),
      description: '灵动终端中的 session 总数，可能大于终端页数量'
    },
    {
      key: 'terminal-cache-entries',
      label: 'Terminal cache entries',
      value: formatDiagnosticValue(terminals?.cachedEntries),
      description: '后台 terminalCache 条目数，切项目后会落到这里'
    },
    {
      key: 'terminal-cache-terminals',
      label: 'Cached terminals',
      value: formatDiagnosticValue(terminals?.cachedTerminals),
      description: 'terminalCache 里缓存的终端实例总数'
    },
    {
      key: 'terminal-router-init',
      label: 'Terminal router init',
      value: formatDiagnosticValue(renderer?.terminalRouter?.initialized),
      description: '全局终端 IPC 路由是否已初始化'
    },
    {
      key: 'js-heap-used',
      label: 'JS heap used',
      value: formatDiagnosticValue(jsHeap?.usedJSHeapSize, formatBytes),
      description: '当前渲染进程已使用的 JS 堆'
    },
    {
      key: 'js-heap-total',
      label: 'JS heap total',
      value: formatDiagnosticValue(jsHeap?.totalJSHeapSize, formatBytes),
      description: '当前渲染进程分配到的 JS 堆'
    },
    {
      key: 'js-heap-limit',
      label: 'JS heap limit',
      value: formatDiagnosticValue(jsHeap?.jsHeapSizeLimit, formatBytes),
      description: '渲染进程 JS 堆上限'
    }
  ]
})

const refreshDiagnostics = async () => {
  diagnosticsLoading.value = true
  diagnosticsError.value = ''
  try {
    if (!window.__openGitDebug?.getMemoryStats) {
      throw new Error('诊断接口未初始化')
    }
    diagnosticsSnapshot.value = await window.__openGitDebug.getMemoryStats()
    diagnosticsLastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (error) {
    diagnosticsError.value = error?.message || '刷新失败'
  } finally {
    diagnosticsLoading.value = false
  }
}

const copyDiagnostics = async () => {
  if (!diagnosticsJson.value) return
  diagnosticsError.value = ''
  try {
    await navigator.clipboard.writeText(diagnosticsJson.value)
  } catch (error) {
    diagnosticsError.value = '复制失败'
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
    await loadOnlineWallpaperProviders()
    if (backgroundMode.value === 'online') {
      await loadOnlineWallpaperList()
      await refreshOnlineWallpaperIfNeeded(false)
    }
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
  background: linear-gradient(180deg, var(--theme-sem-bg-app) 0%, var(--theme-sem-bg-workspace) 100%);
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
  transition: background-color 0.3s ease, opacity 0.3s ease;
  background: linear-gradient(180deg, var(--theme-sem-bg-app) 0%, var(--theme-sem-bg-workspace) 100%);
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
  color: var(--theme-sem-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
  z-index: 10;
}

.settings-btn:hover {
  color: var(--theme-sem-text-primary);
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
  color: var(--theme-sem-text-primary);
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
  color: var(--theme-sem-text-primary);
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  width: 100%;
  white-space: normal;
  word-wrap: break-word;
  word-break: break-word;
  line-height: 1.4;
  overflow: visible;
}

.home-page--light-theme .clock {
  color: var(--theme-sem-text-primary);
  text-shadow: 0 2px 10px rgba(162, 173, 187, 0.18);
}

.home-page--light-theme .date,
.home-page--light-theme .favorite-label {
  text-shadow: 0 1px 4px rgba(162, 173, 187, 0.16);
}

.home-page--light-theme .favorite-icon {
  box-shadow: 0 8px 18px rgba(116, 134, 160, 0.14);
}

.home-page--light-theme .favorite-item:hover .favorite-icon {
  box-shadow: 0 10px 22px rgba(116, 134, 160, 0.18);
}

.home-page--light-theme .favorite-icon-text {
  color: var(--theme-sem-text-on-accent);
  text-shadow: 0 1px 2px rgba(41, 52, 68, 0.14);
}

.home-page--light-theme .favorite-icon-text.text-dark {
  color: var(--theme-sem-text-primary);
  text-shadow: none;
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
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 92%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--theme-sem-border-default);
  overflow: hidden;
}

.settings-drawer-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.settings-drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-sem-text-primary);
}

.settings-drawer-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--theme-sem-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.settings-drawer-close:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
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
  background: color-mix(in srgb, var(--theme-sem-bg-project) 84%, var(--theme-sem-hover) 16%);
  border-right: 1px solid var(--theme-sem-border-default);
  padding: 0;
  overflow-y: auto;
}

.settings-sidebar-item {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--theme-sem-text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.settings-sidebar-item:hover {
  color: var(--theme-sem-text-primary);
  background: var(--theme-sem-hover);
}

.settings-sidebar-item.active {
  color: var(--theme-sem-text-primary);
  background: var(--theme-comp-sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
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
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 76%, transparent);
  color: var(--theme-sem-text-primary);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.theme-option:hover {
  background: var(--theme-sem-hover);
  border-color: var(--theme-sem-border-strong);
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
  box-shadow: inset 0 0 0 1px var(--theme-sem-border-default);
}

.theme-swatch-slate-dual {
  background: linear-gradient(135deg, #14171c 0%, #242931 52%, #4f8cff 100%);
}

.theme-swatch-graphite-moss {
  background: linear-gradient(135deg, #121613 0%, #2c342e 52%, #4e8f64 100%);
}

.theme-swatch-abyss-blue {
  background: linear-gradient(135deg, #0f141d 0%, #293548 52%, #4f78b8 100%);
}

.theme-swatch-mist-paper {
  background: linear-gradient(135deg, #f7f6f2 0%, #dfe6ef 52%, #416fcf 100%);
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
  color: var(--theme-sem-text-primary);
}

.theme-option-appearance {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
}

.source-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.source-toggle-btn {
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 80%, transparent);
  color: var(--theme-sem-text-secondary);
  padding: 10px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.source-toggle-btn:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.source-toggle-btn.active {
  background: color-mix(in srgb, var(--theme-comp-sidebar-item-active-bg) 82%, transparent);
  border-color: var(--theme-comp-sidebar-item-active-border);
  color: var(--theme-sem-text-primary);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.online-wallpaper-summary {
  display: grid;
  gap: 10px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 82%, transparent);
  padding: 12px;
}

.online-wallpaper-summary-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.online-wallpaper-summary-label {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
}

.online-wallpaper-summary-value {
  font-size: 13px;
  color: var(--theme-sem-text-primary);
  font-weight: 600;
}

.provider-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.provider-chip {
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 80%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.provider-chip:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.provider-chip.active {
  background: color-mix(in srgb, var(--theme-comp-sidebar-item-active-bg) 82%, transparent);
  border-color: var(--theme-comp-sidebar-item-active-border);
  color: var(--theme-sem-text-primary);
}

.settings-item-content--stack {
  align-items: stretch;
  flex-direction: column;
}

.settings-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-sem-text-secondary);
  font-size: 13px;
}

.settings-switch input {
  accent-color: var(--theme-sem-accent-primary);
}

.online-wallpaper-error {
  font-size: 12px;
  color: color-mix(in srgb, var(--theme-sem-danger-bg) 78%, var(--theme-sem-text-primary) 22%);
}

.online-wallpaper-error--panel {
  margin-bottom: 12px;
}

.online-wallpaper-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.online-wallpaper-grid--dialog {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.online-wallpaper-card {
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 84%, transparent);
  color: var(--theme-sem-text-primary);
  cursor: pointer;
  padding: 0;
  text-align: left;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.online-wallpaper-card:hover {
  background: var(--theme-sem-hover);
  border-color: var(--theme-sem-border-strong);
  transform: translateY(-1px);
}

.online-wallpaper-card.active {
  border-color: var(--theme-comp-sidebar-item-active-border);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.online-wallpaper-card-preview {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.online-wallpaper-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
}

.online-wallpaper-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-sem-text-primary);
  line-height: 1.35;
}

.online-wallpaper-card-date {
  font-size: 11px;
  color: var(--theme-sem-text-muted);
}

.online-wallpaper-dialog-overlay {
  position: absolute;
  inset: 0;
  z-index: 11000;
  background: color-mix(in srgb, var(--theme-sem-bg-overlay) 70%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 40px;
}

.online-wallpaper-dialog {
  width: min(1120px, calc(100vw - 120px));
  max-height: min(720px, calc(100vh - 120px));
  border-radius: 18px;
  border: 1px solid var(--theme-sem-border-default);
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 94%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.online-wallpaper-dialog-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.online-wallpaper-dialog-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.online-wallpaper-dialog-title h3 {
  margin: 0;
  font-size: 16px;
  color: var(--theme-sem-text-primary);
}

.online-wallpaper-dialog-title span {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
}

.online-wallpaper-dialog-toolbar {
  padding: 14px 18px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.online-wallpaper-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
}

.online-wallpaper-dialog-footer {
  padding: 14px 18px 18px;
  border-top: 1px solid var(--theme-sem-border-default);
  display: flex;
  justify-content: center;
}

.diagnostics-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.diagnostics-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--theme-sem-text-muted);
}

.diagnostics-error {
  color: color-mix(in srgb, var(--theme-sem-danger-bg) 78%, var(--theme-sem-text-primary) 22%);
}

.diagnostics-section {
  margin-bottom: 18px;
}

.diagnostics-section-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-sem-text-primary);
}

.diagnostics-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.diagnostics-card {
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 82%, transparent);
  padding: 12px;
}

.diagnostics-card-label {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
  margin-bottom: 6px;
}

.diagnostics-card-value {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--theme-sem-text-primary);
  margin-bottom: 6px;
}

.diagnostics-card-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--theme-sem-text-secondary);
}

.diagnostics-json {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--theme-sem-border-default);
  background: color-mix(in srgb, var(--theme-sem-bg-project) 90%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
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
  color: var(--theme-sem-text-primary);
}

.settings-item-content {
  display: flex;
  gap: 12px;
  align-items: center;
}

.settings-btn-primary {
  padding: 8px 16px;
  border: 1px solid var(--theme-sem-accent-primary);
  border-radius: 6px;
  background: var(--theme-sem-accent-primary);
  color: var(--theme-sem-text-on-accent);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn-primary:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 86%, black 14%);
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 86%, black 14%);
}

.settings-btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--theme-sem-border-strong);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-sem-bg-dialog) 86%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn-secondary:hover {
  background: var(--theme-sem-hover);
  border-color: var(--theme-sem-border-strong);
}

.settings-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--theme-sem-border-strong) 72%, transparent);
  outline: none;
  -webkit-appearance: none;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--theme-sem-accent-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.settings-slider::-webkit-slider-thumb:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 86%, black 14%);
  transform: scale(1.1);
}

.settings-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--theme-sem-accent-primary);
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.settings-slider::-moz-range-thumb:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 86%, black 14%);
  transform: scale(1.1);
}
</style>
