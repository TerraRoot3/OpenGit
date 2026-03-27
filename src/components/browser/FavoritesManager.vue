<template>
  <div class="browser-home">
    <div class="home-header">
      <h2>收藏管理</h2>
      <div class="favorites-actions">
        <button class="favorites-action-btn" @click="handleExport" title="导出收藏">
          <Download :size="16" />
          <span>导出</span>
        </button>
        <button class="favorites-action-btn" @click="handleImport" title="导入收藏">
          <Upload :size="16" />
          <span>导入</span>
        </button>
      </div>
    </div>
    <div class="favorites-container">
      <!-- 左侧：域名列表 -->
      <div class="favorites-sidebar">
        <div class="sidebar-header">收藏管理</div>
        <div class="domain-list">
          <!-- 全部选项 -->
          <div
            class="domain-item"
            :class="{ active: selectedDomain === null }"
            @click="selectedDomain = null"
          >
            <div class="domain-icon">
              <Globe :size="16" />
            </div>
            <span class="domain-name">全部</span>
            <span class="domain-count">{{ favorites?.length || 0 }}</span>
          </div>
          <!-- 域名分组 -->
          <div
            v-for="domainGroup in groupedFavorites"
            :key="domainGroup.domain"
            class="domain-item"
            :class="{ active: selectedDomain === domainGroup.domain }"
            @click="selectedDomain = domainGroup.domain"
          >
            <div class="domain-icon">
              <img 
                v-if="domainGroup.icon && !(iconErrors.value && iconErrors.value[domainGroup.domain])" 
                :src="domainGroup.icon" 
                :alt="domainGroup.domain"
                @error="() => { if (iconErrors.value) iconErrors.value[domainGroup.domain] = true }"
              />
              <Globe v-else :size="16" />
            </div>
            <span class="domain-name">{{ domainGroup.domain }}</span>
            <span class="domain-count">{{ domainGroup.favorites.length }}</span>
          </div>
        </div>
        <div v-if="groupedFavorites.length === 0" class="empty-domain-message">
          <p>暂无收藏</p>
        </div>
      </div>
      
      <!-- 右侧：收藏列表 -->
      <div class="favorites-content">
        <div v-if="selectedDomain && currentDomainFavorites.length > 0" class="content-header">
          <h3>{{ selectedDomain }}</h3>
        </div>
        <div v-else-if="!selectedDomain && displayFavorites.length > 0" class="content-header">
          <h3>全部</h3>
        </div>
        <!-- 卡片网格布局 -->
        <div class="favorites-grid">
          <div 
            v-for="fav in displayFavorites" 
            :key="fav.id"
            class="favorite-card"
            :class="{
              'dragging': draggingFavoriteId === fav.id,
              'drag-over': dragOverFavoriteId === fav.id
            }"
            :draggable="!selectedDomain"
            @click="handleNavigate(fav.url)"
            @contextmenu.prevent="(e) => handleContextMenu(e, fav)"
            @dragstart="(e) => onFavoriteDragStart(e, fav)"
            @dragend="onFavoriteDragEnd"
            @dragover="(e) => onFavoriteDragOver(e, fav)"
            @dragleave="onFavoriteDragLeave"
            @drop="(e) => onFavoriteDrop(e, fav)"
          >
            <div 
              class="favorite-card-icon"
              :style="getCardIconStyle(fav)"
              :class="{ 'has-icon': hasValidIcon(fav) }"
            >
              <!-- 如果有图标，显示图标 -->
              <img 
                v-if="hasValidIcon(fav)"
                :src="getIconUrl(fav)"
                :alt="fav.title || getDomainFromUrl(fav.url)"
                @error="() => handleIconError(fav)"
                class="favorite-icon-image"
              />
              <!-- 如果没有图标，显示颜色背景+文字 -->
              <span 
                v-else
                class="favorite-card-text" 
                :style="getTextStyle(fav)"
              >
                {{ getCardText(fav) }}
              </span>
            </div>
            <!-- 图标下方显示完整文字 -->
            <div class="favorite-card-label">
              {{ fav.title || getDomainFromUrl(fav.url) }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- 收藏右键菜单 -->
      <div 
        v-if="showContextMenu"
        class="context-menu favorite-context-menu"
        :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px', zIndex: 10000 }"
        @click.stop
      >
        <div class="context-menu-item" @click="handleEdit">
          编辑
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="handleDelete">
          删除
        </div>
      </div>
      
      <!-- 编辑收藏对话框 -->
      <div v-if="showEditFavoriteDialog" class="dialog-overlay" @click="closeEditFavoriteDialog">
        <div class="edit-favorite-dialog" @click.stop>
          <div class="edit-dialog-header">
            <h3>编辑图标</h3>
            <button class="edit-dialog-close" @click="closeEditFavoriteDialog">
              <X :size="18" />
            </button>
          </div>
          <div class="edit-dialog-body">
            <!-- 地址 -->
            <div class="edit-form-group">
              <label>地址</label>
              <div class="edit-input-with-button">
                <input 
                  type="text"
                  v-model="editingFavoriteUrl"
                  placeholder="请输入地址"
                  class="edit-form-input"
                  readonly
                />
                <button 
                  class="edit-get-icon-btn" 
                  @click="getIconFromUrl"
                  :disabled="iconFetchStatus === 'loading'"
                  :class="{ 
                    loading: iconFetchStatus === 'loading',
                    success: iconFetchStatus === 'success',
                    error: iconFetchStatus === 'error'
                  }"
                >
                  <Loader2 v-if="iconFetchStatus === 'loading'" :size="14" class="icon-spin" />
                  <Check v-else-if="iconFetchStatus === 'success'" :size="14" />
                  <AlertCircle v-else-if="iconFetchStatus === 'error'" :size="14" />
                  <span>{{ iconFetchStatus === 'loading' ? '获取中' : '获取' }}</span>
                </button>
              </div>
            </div>
            
            <!-- 隐藏的 webview 用于获取 favicon -->
            <webview 
              v-if="hiddenWebviewUrl"
              ref="hiddenWebviewRef"
              :src="hiddenWebviewUrl"
              class="hidden-webview"
              @page-favicon-updated="onHiddenWebviewFaviconUpdated"
              @did-fail-load="onHiddenWebviewFailed"
              @did-stop-loading="onHiddenWebviewLoaded"
            ></webview>
            
            <!-- 图标预览 -->
            <div class="edit-form-group">
              <label>图标预览</label>
              <div class="icon-preview">
                <div 
                  class="icon-preview-item"
                  :style="getCardIconStyle({ icon: editingFavoriteIcon, iconError: editingFavoriteIconError, customColor: editingFavoriteColor })"
                  :class="{ 'has-icon': editingFavoriteIcon && !editingFavoriteIconError }"
                >
                  <img 
                    v-if="editingFavoriteIcon && !editingFavoriteIconError" 
                    :src="editingFavoriteIcon" 
                    alt="图标预览"
                    @error="editingFavoriteIconError = true"
                    class="icon-preview-image"
                  />
                  <span 
                    v-else
                    class="icon-preview-text" 
                    :style="getTextStyle({ title: editingFavoriteTitle || getDomainFromUrl(editingFavoriteUrl) || '收藏', url: editingFavoriteUrl })"
                  >
                    {{ getCardText({ title: editingFavoriteTitle || getDomainFromUrl(editingFavoriteUrl) || '收藏', url: editingFavoriteUrl }) }}
                  </span>
                </div>
                <div class="icon-preview-hint">
                  <span v-if="editingFavoriteIcon && !editingFavoriteIconError">已设置图标</span>
                  <span v-else>未设置图标，将使用颜色背景</span>
                </div>
              </div>
            </div>
            
            <!-- 名称 -->
            <div class="edit-form-group">
              <label>名称</label>
              <input 
                type="text"
                v-model="editingFavoriteTitle"
                placeholder="请输入名称"
                class="edit-form-input"
                @keyup.enter="saveFavoriteEdit"
              />
            </div>
            
            <!-- 图标颜色 -->
            <div class="edit-form-group">
              <label>图标颜色</label>
              <div class="color-picker">
                <div 
                  v-for="(color, index) in presetColors"
                  :key="index"
                  class="color-swatch"
                  :class="{ active: editingFavoriteColor === color }"
                  :style="{ background: color }"
                  @click="editingFavoriteColor = color"
                >
                  <div v-if="editingFavoriteColor === color" class="color-check"></div>
                </div>
                <!-- 色板选择器 -->
                <div 
                  class="color-swatch color-picker-trigger"
                  :style="{ background: editingFavoriteColor }"
                  @click="showColorPicker = !showColorPicker"
                >
                  <div class="color-picker-icon">🎨</div>
                </div>
              </div>
              
              <!-- 颜色选择器面板 -->
              <div v-if="showColorPicker" class="color-picker-panel">
                <div class="color-picker-main">
                  <div 
                    class="color-picker-saturation"
                    :style="{ background: `hsl(${hue}, 100%, 50%)` }"
                    @mousedown="startColorPick"
                    ref="saturationRef"
                  >
                    <div 
                      class="color-picker-pointer"
                      :style="{ 
                        left: saturationX + 'px', 
                        top: saturationY + 'px',
                        background: editingFavoriteColor
                      }"
                    ></div>
                  </div>
                  <div 
                    class="color-picker-hue"
                    @mousedown="startHuePick"
                    ref="hueRef"
                  >
                    <div 
                      class="color-picker-hue-pointer"
                      :style="{ top: hueY + 'px' }"
                    ></div>
                  </div>
                </div>
                <div class="color-picker-footer">
                  <input 
                    type="text"
                    v-model="colorHexInput"
                    class="color-hex-input"
                    @input="updateColorFromHex"
                    placeholder="#000000"
                  />
                  <button class="color-picker-clear" @click="clearCustomColor">清除</button>
                  <button class="color-picker-ok" @click="confirmCustomColor">确定</button>
                </div>
              </div>
            </div>
          </div>
          <div class="edit-dialog-footer">
            <button class="edit-save-btn" @click="saveFavoriteEdit">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Globe, Download, Upload, X, Loader2, Check, AlertCircle } from 'lucide-vue-next'
import { useFavorites } from '../../composables/useFavorites'

const props = defineProps({
  // favorites 现在直接从 composable 获取，不再通过 props 传递
})

const emit = defineEmits(['navigate'])

// 使用 composable
const { favorites, removeFavorite, updateFavorite, updateFavoritesOrder, exportFavorites, importFavorites } = useFavorites()

const selectedDomain = ref(null)

// 拖拽排序相关
const draggingFavoriteId = ref(null)
const dragOverFavoriteId = ref(null)

// 图标错误状态（使用普通对象存储，避免修改 props）
const iconErrors = ref({})

// 编辑对话框相关
const showEditFavoriteDialog = ref(false)
const editingFavoriteTitle = ref('')
const editingFavoriteUrl = ref('')
const editingFavoriteId = ref(null)
const editingFavoriteColor = ref('#3b82f6')
const editingFavoriteIcon = ref(null) // 编辑中的图标
const editingFavoriteIconError = ref(false) // 图标加载错误
const showColorPicker = ref(false)

// 隐藏 webview 相关
const hiddenWebviewRef = ref(null)
const hiddenWebviewUrl = ref(null)
let hiddenWebviewTimeout = null
const iconFetchStatus = ref(null) // 'loading' | 'success' | 'error' | null

// 预设颜色
const presetColors = [
  '#3b82f6', // 蓝色
  '#eab308', // 黄色
  '#ef4444', // 红色
  '#d97706', // 棕色
  '#22c55e', // 绿色
  '#1e40af', // 深蓝
  '#dc2626', // 深红
  '#0ea5e9', // 浅蓝
  '#10b981', // 浅绿
  '#6b7280', // 灰色
  '#a855f7'  // 紫色
]

// 颜色选择器相关
const hue = ref(210)
const saturationX = ref(100)
const saturationY = ref(50)
const hueY = ref(0)
const colorHexInput = ref('#3b82f6')
const saturationRef = ref(null)
const hueRef = ref(null)
let isPickingColor = false
let isPickingHue = false

// 按域名分组收藏
const groupedFavorites = computed(() => {
  // 如果没有收藏，返回空数组
  if (!favorites.value || favorites.value.length === 0) {
    return []
  }
  
  const groups = {}
  // 创建收藏的副本，避免修改原始数据
  const favoritesCopy = [...favorites.value]
  
  favoritesCopy.forEach(fav => {
    // 提取域名
    let domain = fav.domain || ''
    if (!domain && fav.url) {
      try {
        const urlObj = new URL(fav.url)
        domain = urlObj.hostname
      } catch (e) {
        domain = '其他'
      }
    }
    if (!domain) domain = '其他'
    
    if (!groups[domain]) {
      groups[domain] = {
        domain: domain,
        favorites: [],
        icon: null
      }
    }
    // 直接 push fav，因为这是副本数组
    groups[domain].favorites.push(fav)
    // 使用第一个收藏的图标作为域名图标
    const favHasError = iconErrors.value && iconErrors.value[fav.id]
    if (!groups[domain].icon && fav.icon && !favHasError) {
      groups[domain].icon = fav.icon
    }
  })
  
  // 转换为数组并排序
  return Object.values(groups).sort((a, b) => {
    // 按收藏数量降序，然后按域名排序
    if (b.favorites.length !== a.favorites.length) {
      return b.favorites.length - a.favorites.length
    }
    return a.domain.localeCompare(b.domain)
  })
})

// 当前选中域名的收藏列表
const currentDomainFavorites = computed(() => {
  if (!selectedDomain.value) return []
  const group = groupedFavorites.value.find(g => g.domain === selectedDomain.value)
  if (!group) return []
  // 创建副本再排序，避免修改原始数组
  return [...group.favorites].sort((a, b) => {
    // 按创建时间降序
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })
})

// 显示的收藏列表（选中域名时显示该域名的，否则显示全部）
const displayFavorites = computed(() => {
  if (selectedDomain.value) {
    return currentDomainFavorites.value
  }
  // 显示全部收藏
  // 创建副本再排序，避免修改原始数组
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

// 右键菜单相关
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuFavorite = ref(null)

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

// 检查是否有有效图标
const hasValidIcon = (fav) => {
  const hasError = iconErrors.value && iconErrors.value[fav.id]
  return !!(fav.icon && !hasError)
}

// 获取图标 URL
const getIconUrl = (fav) => {
  return fav.icon
}

// 处理图标错误
const handleIconError = (fav) => {
  if (!iconErrors.value) {
    iconErrors.value = {}
  }
  iconErrors.value[fav.id] = true
}

// 获取卡片文字
const getCardText = (fav) => {
  return fav.title || getDomainFromUrl(fav.url) || '收藏'
}

// 获取卡片图标样式
const getCardIconStyle = (fav) => {
  // 如果有图标，不设置背景色（让图标占满容器）
  if (hasValidIcon(fav)) {
    return {}
  }
  
  // 如果没有图标，使用颜色背景
  const color = (() => {
    if (fav.customColor) {
      return fav.customColor
    }
    const domain = fav.domain || getDomainFromUrl(fav.url) || 'default'
    return generateColorFromDomain(domain)
  })()
  return {
    background: color
  }
}

// 获取文字样式
const getTextStyle = (fav) => {
  const text = fav.title || getDomainFromUrl(fav.url) || ''
  if (!text) {
    return { fontSize: '14px' }
  }
  
  // 根据文字长度动态调整字号
  const length = text.length
  let fontSize = '16px'
  if (length > 10) fontSize = '14px'
  if (length > 15) fontSize = '12px'
  if (length > 20) fontSize = '10px'
  
  return { fontSize }
}

// 从 URL 提取域名
const getDomainFromUrl = (url) => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch (e) {
    return ''
  }
}

// 处理导航
const handleNavigate = (url) => {
  emit('navigate', url)
}

// ==================== 拖拽排序 ====================

// 开始拖拽
const onFavoriteDragStart = (event, fav) => {
  // 只在"全部收藏"视图下允许拖拽排序
  if (selectedDomain.value) {
    event.preventDefault()
    return
  }
  
  draggingFavoriteId.value = fav.id
  event.dataTransfer.effectAllowed = 'move'
  event.target.style.opacity = '0.5'
}

// 拖拽结束
const onFavoriteDragEnd = (event) => {
  event.target.style.opacity = '1'
  draggingFavoriteId.value = null
  dragOverFavoriteId.value = null
}

// 拖拽经过
const onFavoriteDragOver = (event, fav) => {
  event.preventDefault()
  
  // 只在"全部收藏"视图下允许
  if (selectedDomain.value) {
    return
  }
  
  // 不能放置到自己身上
  if (fav.id === draggingFavoriteId.value) {
    return
  }
  
  dragOverFavoriteId.value = fav.id
}

// 拖拽离开
const onFavoriteDragLeave = () => {
  dragOverFavoriteId.value = null
}

// 放置
const onFavoriteDrop = async (event, targetFav) => {
  event.preventDefault()
  
  // 只在"全部收藏"视图下允许
  if (selectedDomain.value) {
    return
  }
  
  const draggedId = draggingFavoriteId.value
  
  // 不能放置到自己身上
  if (targetFav.id === draggedId || !draggedId) {
    draggingFavoriteId.value = null
    dragOverFavoriteId.value = null
    return
  }
  
  // 获取当前显示的收藏列表（已排序）
  const currentList = [...displayFavorites.value]
  const draggedIndex = currentList.findIndex(f => f.id === draggedId)
  const targetIndex = currentList.findIndex(f => f.id === targetFav.id)
  
  if (draggedIndex === -1 || targetIndex === -1) {
    draggingFavoriteId.value = null
    dragOverFavoriteId.value = null
    return
  }
  
  // 移动元素
  const [draggedItem] = currentList.splice(draggedIndex, 1)
  currentList.splice(targetIndex, 0, draggedItem)
  
  // 更新排序
  const orderedIds = currentList.map(f => f.id)
  await updateFavoritesOrder(orderedIds)
  
  // 清除拖拽状态
  draggingFavoriteId.value = null
  dragOverFavoriteId.value = null
}

// 处理右键菜单
const handleContextMenu = (event, fav) => {
  event.preventDefault()
  event.stopPropagation()
  
  contextMenuFavorite.value = fav
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  showContextMenu.value = true
}

// 处理编辑
const handleEdit = () => {
  if (!contextMenuFavorite.value) return
  
  const fav = contextMenuFavorite.value
  editingFavoriteId.value = fav.id
  editingFavoriteTitle.value = fav.title || ''
  editingFavoriteUrl.value = fav.url || ''
  editingFavoriteIcon.value = fav.icon || null
  editingFavoriteIconError.value = fav.iconError || false
  
  // 获取当前收藏的颜色
  const domain = fav.domain || getDomainFromUrl(fav.url) || 'default'
  editingFavoriteColor.value = fav.customColor || generateColorFromDomain(domain)
  colorHexInput.value = editingFavoriteColor.value
  
  // 从颜色计算hue和saturation
  updateHueSaturationFromColor(editingFavoriteColor.value)
  
  // 重置获取图标状态
  iconFetchStatus.value = null
  
  showEditFavoriteDialog.value = true
  showContextMenu.value = false
  showColorPicker.value = false
}

// 关闭编辑对话框
const closeEditFavoriteDialog = () => {
  showEditFavoriteDialog.value = false
  editingFavoriteId.value = null
  editingFavoriteTitle.value = ''
  editingFavoriteUrl.value = ''
  editingFavoriteColor.value = '#3b82f6'
  editingFavoriteIcon.value = null
  editingFavoriteIconError.value = false
  iconFetchStatus.value = null
  showColorPicker.value = false
}

// 处理删除
const handleDelete = async () => {
  if (contextMenuFavorite.value) {
    await removeFavorite(contextMenuFavorite.value.id)
    showContextMenu.value = false
  }
}

// 处理导出
const handleExport = async () => {
  await exportFavorites()
}

// 处理导入
const handleImport = async () => {
  await importFavorites()
}

// 从颜色计算hue和saturation
const updateHueSaturationFromColor = (color) => {
  try {
    const r = parseInt(color.slice(1, 3), 16) / 255
    const g = parseInt(color.slice(3, 5), 16) / 255
    const b = parseInt(color.slice(5, 7), 16) / 255
    
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    
    let h = 0
    if (delta !== 0) {
      if (max === r) {
        h = ((g - b) / delta) % 6
      } else if (max === g) {
        h = (b - r) / delta + 2
      } else {
        h = (r - g) / delta + 4
      }
    }
    h = Math.round(h * 60)
    if (h < 0) h += 360
    
    const s = max === 0 ? 0 : delta / max
    const l = (max + min) / 2
    
    hue.value = h
    saturationX.value = s * 100
    saturationY.value = (1 - l) * 100
    hueY.value = (h / 360) * 200
  } catch (e) {
    // 忽略错误
  }
}

// 从hue和saturation计算颜色
const updateColorFromHueSaturation = () => {
  const s = saturationX.value / 100
  const l = 1 - (saturationY.value / 100)
  const h = hue.value
  
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  
  let r = 0, g = 0, b = 0
  if (h < 60) {
    r = c; g = x; b = 0
  } else if (h < 120) {
    r = x; g = c; b = 0
  } else if (h < 180) {
    r = 0; g = c; b = x
  } else if (h < 240) {
    r = 0; g = x; b = c
  } else if (h < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }
  
  r = Math.round((r + m) * 255)
  g = Math.round((g + m) * 255)
  b = Math.round((b + m) * 255)
  
  const hex = '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
  
  editingFavoriteColor.value = hex
  colorHexInput.value = hex
}

// 开始颜色选择
const startColorPick = (e) => {
  isPickingColor = true
  updateSaturationPosition(e)
  document.addEventListener('mousemove', onColorPickMove)
  document.addEventListener('mouseup', stopColorPick)
}

// 颜色选择移动
const onColorPickMove = (e) => {
  if (isPickingColor) {
    updateSaturationPosition(e)
  }
  if (isPickingHue) {
    updateHuePosition(e)
  }
}

// 更新饱和度位置
const updateSaturationPosition = (e) => {
  if (!saturationRef.value) return
  const rect = saturationRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(200, e.clientX - rect.left))
  const y = Math.max(0, Math.min(200, e.clientY - rect.top))
  saturationX.value = (x / 200) * 100
  saturationY.value = (y / 200) * 100
  updateColorFromHueSaturation()
}

// 开始色相选择
const startHuePick = (e) => {
  isPickingHue = true
  updateHuePosition(e)
  document.addEventListener('mousemove', onColorPickMove)
  document.addEventListener('mouseup', stopColorPick)
}

// 更新色相位置
const updateHuePosition = (e) => {
  if (!hueRef.value) return
  const rect = hueRef.value.getBoundingClientRect()
  const y = Math.max(0, Math.min(200, e.clientY - rect.top))
  hueY.value = y
  hue.value = (y / 200) * 360
  updateColorFromHueSaturation()
}

// 停止颜色选择
const stopColorPick = () => {
  isPickingColor = false
  isPickingHue = false
  document.removeEventListener('mousemove', onColorPickMove)
  document.removeEventListener('mouseup', stopColorPick)
}

// 从hex输入更新颜色
const updateColorFromHex = () => {
  const hex = colorHexInput.value.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    editingFavoriteColor.value = hex
    updateHueSaturationFromColor(hex)
  }
}

// 清除自定义颜色
const clearCustomColor = () => {
  if (!contextMenuFavorite.value) return
  const domain = contextMenuFavorite.value.domain || getDomainFromUrl(contextMenuFavorite.value.url) || 'default'
  editingFavoriteColor.value = generateColorFromDomain(domain)
  colorHexInput.value = editingFavoriteColor.value
  updateHueSaturationFromColor(editingFavoriteColor.value)
}

// 确认自定义颜色
const confirmCustomColor = () => {
  showColorPicker.value = false
}

// 从URL获取图标（使用隐藏的 webview）
const getIconFromUrl = async () => {
  if (!editingFavoriteUrl.value) return

  iconFetchStatus.value = 'loading'
  editingFavoriteIconError.value = false

  // 清除之前的超时
  if (hiddenWebviewTimeout) {
    clearTimeout(hiddenWebviewTimeout)
    hiddenWebviewTimeout = null
  }

  // 设置隐藏 webview 的 URL，触发加载
  hiddenWebviewUrl.value = editingFavoriteUrl.value
  console.log('🔍 使用隐藏 webview 获取 favicon:', editingFavoriteUrl.value)

  // 设置超时（10秒后如果还没获取到就失败）
  hiddenWebviewTimeout = setTimeout(() => {
    if (iconFetchStatus.value === 'loading') {
      console.warn('⏰ 获取 favicon 超时')
      // 超时后尝试使用 Google 服务
      tryGoogleFavicon()
    }
  }, 10000)
}

// 隐藏 webview 获取到 favicon
const onHiddenWebviewFaviconUpdated = (event) => {
  if (event.favicons && event.favicons.length > 0) {
    const favicon = event.favicons[event.favicons.length - 1]
    console.log('✅ 隐藏 webview 获取到 favicon:', favicon)
    
    editingFavoriteIcon.value = favicon
    editingFavoriteIconError.value = false
    iconFetchStatus.value = 'success'
    
    // 清除超时
    if (hiddenWebviewTimeout) {
      clearTimeout(hiddenWebviewTimeout)
      hiddenWebviewTimeout = null
    }
    
    // 移除隐藏的 webview
    hiddenWebviewUrl.value = null
    
    setTimeout(() => {
      if (iconFetchStatus.value === 'success') {
        iconFetchStatus.value = null
      }
    }, 2000)
  }
}

// 隐藏 webview 加载完成（如果没有获取到 favicon，尝试备用方案）
const onHiddenWebviewLoaded = () => {
  // 等待一小段时间，看是否会触发 favicon 事件
  setTimeout(() => {
    if (iconFetchStatus.value === 'loading' && !editingFavoriteIcon.value) {
      console.log('🔄 webview 加载完成但未获取到 favicon，尝试备用方案')
      tryGoogleFavicon()
    }
  }, 2000)
}

// 隐藏 webview 加载失败
const onHiddenWebviewFailed = () => {
  console.warn('❌ 隐藏 webview 加载失败')
  tryGoogleFavicon()
}

// 尝试使用 Google favicon 服务作为备用
const tryGoogleFavicon = async () => {
  // 移除隐藏的 webview
  hiddenWebviewUrl.value = null
  
  // 清除超时
  if (hiddenWebviewTimeout) {
    clearTimeout(hiddenWebviewTimeout)
    hiddenWebviewTimeout = null
  }
  
  try {
    const urlObj = new URL(editingFavoriteUrl.value)
    const domain = urlObj.hostname
    const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    
    console.log('🔄 尝试 Google favicon 服务:', googleFavicon)
    editingFavoriteIcon.value = googleFavicon
    editingFavoriteIconError.value = false
    iconFetchStatus.value = 'success'
    
    setTimeout(() => {
      if (iconFetchStatus.value === 'success') {
        iconFetchStatus.value = null
      }
    }, 2000)
  } catch (error) {
    iconFetchStatus.value = 'error'
    editingFavoriteIconError.value = true
    console.error('获取图标失败:', error)
  }
}

// 保存收藏编辑
const saveFavoriteEdit = async () => {
  if (!editingFavoriteId.value) return

  try {
    const favId = editingFavoriteId.value
    
    await updateFavorite({
      id: favId,
      title: editingFavoriteTitle.value.trim(),
      customColor: editingFavoriteColor.value,
      icon: editingFavoriteIcon.value
    })

    // 清除该收藏的图标错误状态
    if (iconErrors.value && iconErrors.value[favId]) {
      delete iconErrors.value[favId]
    }

    closeEditFavoriteDialog()
  } catch (error) {
    console.error('保存收藏编辑失败:', error)
  }
}

// 点击外部关闭菜单
const handleClickOutside = () => {
  if (showContextMenu.value) {
    showContextMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  // 清理颜色选择器事件监听
  document.removeEventListener('mousemove', onColorPickMove)
  document.removeEventListener('mouseup', stopColorPick)
})

// 确保组件正确暴露
defineExpose({})
</script>

<style scoped>
.browser-home {
  width: 100%;
  height: 100%;
  display: flex;
  background: #1e1e1e;
  overflow: hidden;
}

.home-header {
  display: none;
}

.favorites-actions {
  display: flex;
  gap: 8px;
}

.favorites-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  transition: all 0.2s;
}

.favorites-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.favorites-action-btn:active {
  background: rgba(255, 255, 255, 0.15);
}

.favorites-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* 左侧：域名列表 */
.favorites-sidebar {
  width: 220px;
  min-width: 220px;
  flex-shrink: 0;
  background: #252526;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.sidebar-header {
  height: 70px;
  padding: 0 20px;
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.domain-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.domain-list::-webkit-scrollbar {
  width: 6px;
}

.domain-list::-webkit-scrollbar-track {
  background: transparent;
}

.domain-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.domain-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.domain-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.domain-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.domain-item.active {
  background: #667eea;
  color: #fff;
}

.domain-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
}

.domain-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: transparent;
}

.domain-item.active .domain-icon {
  color: #fff;
}

.domain-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.domain-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.domain-item.active .domain-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.empty-domain-message {
  padding: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* 右侧：收藏列表 */
.favorites-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.content-header {
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  box-sizing: border-box;
}

.content-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  line-height: 1;
}

.favorites-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* 卡片网格布局 */
.favorites-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 16px;
  align-content: start;
}

@media (min-width: 768px) {
  .favorites-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
}

@media (min-width: 1200px) {
  .favorites-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

.favorites-grid::-webkit-scrollbar {
  width: 6px;
}

.favorites-grid::-webkit-scrollbar-track {
  background: transparent;
}

.favorites-grid::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.favorites-grid::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.favorite-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  padding: 8px;
  border-radius: 12px;
}

.favorite-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.08);
}

/* 拖拽样式 */
.favorite-card[draggable="true"] {
  cursor: grab;
}

.favorite-card[draggable="true"]:active {
  cursor: grabbing;
}

.favorite-card.dragging {
  opacity: 0.5;
}

.favorite-card.drag-over {
  background: rgba(102, 126, 234, 0.15);
  border-radius: 12px;
}

.favorite-card.drag-over::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background: #667eea;
  border-radius: 2px;
}

.favorite-card-icon {
  width: 100%;
  aspect-ratio: 1;
  max-width: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
  min-height: 64px;
  padding: 8px;
  box-sizing: border-box;
  /* background 由 getCardIconStyle 动态设置 */
}

.favorite-card-icon.has-icon {
  padding: 12px;
}

.favorite-card:hover .favorite-card-icon {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.favorite-card-text {
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  text-align: center;
  word-wrap: break-word;
  word-break: break-all;
  line-height: 1.3;
  overflow: hidden;
  padding: 4px;
  box-sizing: border-box;
  white-space: normal;
}

.favorite-icon-image {
  width: auto;
  height: auto;
  max-width: 60%;
  max-height: 60%;
  object-fit: contain;
  border-radius: 8px;
  box-sizing: border-box;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

.favorite-card-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  width: 100%;
  margin-top: 8px;
  padding: 0 4px;
  line-height: 1.4;
  word-wrap: break-word;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  min-height: 36px;
  max-height: 50px;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  padding: 4px 0;
  z-index: 99999;
  min-width: 160px;
  font-size: 14px;
  pointer-events: auto;
}

.favorite-context-menu {
  z-index: 999999 !important;
}

.context-menu-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
  color: rgba(255, 255, 255, 0.9);
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

/* 编辑对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.edit-favorite-dialog {
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  min-width: 500px;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #fff;
}

.edit-dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.edit-dialog-close {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.edit-dialog-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.edit-dialog-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.edit-form-group {
  margin-bottom: 24px;
}

.edit-form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #ccc;
}

.edit-form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.edit-form-input:focus {
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.08);
}

.edit-form-input[readonly] {
  background: rgba(255, 255, 255, 0.03);
  color: #999;
  cursor: not-allowed;
}

.edit-input-with-button {
  display: flex;
  gap: 8px;
  align-items: center;
}

.edit-input-with-button .edit-form-input {
  flex: 1;
}

.edit-get-icon-btn {
  padding: 8px 12px;
  height: 38px;
  min-width: 70px;
  background: #667eea;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.edit-get-icon-btn:hover:not(:disabled) {
  background: #5568d3;
}

.edit-get-icon-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.edit-get-icon-btn.loading {
  background: #667eea;
}

.edit-get-icon-btn.success {
  background: #22c55e;
}

.edit-get-icon-btn.error {
  background: #ef4444;
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 图标预览 */
.icon-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.icon-preview-item {
  width: 100px;
  height: 100px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 8px;
  box-sizing: border-box;
  background: transparent;
}

.icon-preview-item.has-icon {
  padding: 0;
}

.icon-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px;
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
}

.icon-preview-text {
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  text-align: center;
  word-wrap: break-word;
  word-break: break-all;
  line-height: 1.3;
  overflow: hidden;
  padding: 4px;
  box-sizing: border-box;
  white-space: normal;
}

.icon-preview-hint {
  font-size: 12px;
  color: #999;
}

/* 颜色选择器 */
.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.color-swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  border: 2px solid transparent;
  transition: all 0.2s;
  flex-shrink: 0;
}

.color-swatch:hover {
  transform: scale(1.1);
}

.color-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.color-check {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-check::after {
  content: '✓';
  color: #333;
  font-size: 12px;
  font-weight: bold;
}

.color-picker-trigger {
  border: 2px dashed rgba(255, 255, 255, 0.3);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.color-picker-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 20px;
}

/* 颜色选择器面板 */
.color-picker-panel {
  margin-top: 16px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.color-picker-main {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.color-picker-saturation {
  width: 200px;
  height: 200px;
  border-radius: 8px;
  position: relative;
  cursor: crosshair;
  background: linear-gradient(to right, #fff, transparent),
              linear-gradient(to top, #000, transparent);
}

.color-picker-pointer {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.color-picker-hue {
  width: 20px;
  height: 200px;
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  background: linear-gradient(to bottom, 
    #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000
  );
}

.color-picker-hue-pointer {
  position: absolute;
  left: -4px;
  width: 28px;
  height: 4px;
  border: 2px solid #fff;
  border-radius: 2px;
  transform: translateY(-50%);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.color-picker-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-hex-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 14px;
  font-family: monospace;
  outline: none;
}

.color-hex-input:focus {
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.08);
}

.color-picker-clear,
.color-picker-ok {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.color-picker-clear {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.color-picker-clear:hover {
  background: rgba(255, 255, 255, 0.2);
}

.color-picker-ok {
  background: #667eea;
  color: #fff;
}

.color-picker-ok:hover {
  background: #5568d3;
}

.edit-dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
}

.edit-save-btn {
  padding: 10px 24px;
  background: #667eea;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-save-btn:hover {
  background: #5568d3;
}

/* 隐藏的 webview */
.hidden-webview {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}
</style>

