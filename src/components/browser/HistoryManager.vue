<template>
  <div class="browsing-history">
    <!-- 左侧边栏 -->
    <div class="history-sidebar">
      <div class="sidebar-header">
        <h2>历史记录</h2>
      </div>
      <div class="sidebar-menu">
        <div 
          class="sidebar-item" 
          :class="{ active: activeFilter === 'all' }"
          @click="setFilter('all')"
        >
          <LayoutGrid :size="16" />
          <span>全部</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeFilter === '1h' }"
          @click="setFilter('1h')"
        >
          <Clock :size="16" />
          <span>最近 1 小时</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeFilter === '4h' }"
          @click="setFilter('4h')"
        >
          <Clock :size="16" />
          <span>最近 4 小时</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeFilter === '1d' }"
          @click="setFilter('1d')"
        >
          <Clock :size="16" />
          <span>最近 1 天</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeFilter === '7d' }"
          @click="setFilter('7d')"
        >
          <Clock :size="16" />
          <span>最近 7 天</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeFilter === 'older' }"
          @click="setFilter('older')"
        >
          <Clock :size="16" />
          <span>7 天前</span>
        </div>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="history-content">
      <!-- 顶部工具栏 -->
      <div class="history-toolbar">
        <h3>{{ filterTitle }}</h3>
        <div class="toolbar-actions">
          <div class="search-box">
            <Search :size="16" />
            <input 
              v-model="searchQuery" 
              placeholder="搜索历史记录" 
              type="text"
            />
          </div>
          <button class="toolbar-action-btn" @click="showDatePicker = !showDatePicker">
            <Filter :size="16" />
            <span>按日期筛选</span>
          </button>
          <button 
            class="toolbar-action-btn danger" 
            @click="deleteSelectedHistory"
            :disabled="selectedItems.size === 0"
          >
            <Trash2 :size="16" />
            <span>删除浏览数据</span>
          </button>
        </div>
      </div>

      <!-- 日期选择器 -->
      <div v-if="showDatePicker" class="date-picker-panel">
        <div class="date-picker-row">
          <label>开始日期：</label>
          <input type="date" v-model="startDate" />
        </div>
        <div class="date-picker-row">
          <label>结束日期：</label>
          <input type="date" v-model="endDate" />
        </div>
        <div class="date-picker-actions">
          <button class="btn-secondary" @click="clearDateFilter">清除筛选</button>
          <button class="btn-primary" @click="applyDateFilter">应用</button>
        </div>
      </div>

      <!-- 历史记录列表 -->
      <div class="history-list" ref="historyListRef">
        <div v-if="filteredHistory.length === 0" class="empty-state">
          <Clock :size="48" />
          <p>暂无历史记录</p>
        </div>
        
        <template v-else>
          <div 
            v-for="(group, date) in groupedHistory" 
            :key="date"
            class="history-group"
          >
            <div class="group-header">
              <span>{{ formatDateHeader(date) }}</span>
            </div>
            <div class="group-items">
              <div 
                v-for="item in group" 
                :key="item.id"
                class="history-item"
                :class="{ selected: selectedItems.has(item.id) }"
              >
                <input 
                  type="checkbox" 
                  :checked="selectedItems.has(item.id)"
                  @change="toggleSelection(item.id)"
                  class="history-checkbox"
                />
                <img 
                  v-if="item.favicon" 
                  :src="item.favicon" 
                  class="history-favicon"
                  @error="handleFaviconError($event, item)"
                />
                <div v-else class="history-favicon-placeholder">
                  <Globe :size="16" />
                </div>
                <div class="history-info" @click="openHistoryItem(item)">
                  <div class="history-title">{{ item.title || item.url }}</div>
                  <div class="history-url">{{ item.domain }}</div>
                </div>
                <div class="history-time">{{ formatTime(item.visitTime) }}</div>
                <button 
                  class="history-delete-btn" 
                  @click.stop="deleteSingleItem(item.id)"
                  title="删除"
                >
                  <X :size="16" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 全选/删除操作栏 -->
      <div v-if="filteredHistory.length > 0" class="history-footer">
        <label class="select-all-label">
          <input 
            type="checkbox" 
            :checked="isAllSelected"
            @change="toggleSelectAll"
          />
          <span>全选当前列表</span>
        </label>
        <span class="selected-count">已选择 {{ selectedItems.size }} 项</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Search, LayoutGrid, Filter, Trash2, Clock, Globe, X } from 'lucide-vue-next'
import { useBrowsingHistory } from '../../composables/useBrowsingHistory'

const emit = defineEmits(['navigate', 'close'])

// 使用共享的历史记录 composable
const { browsingHistory, loadHistory, removeHistoryItem, removeHistoryItems } = useBrowsingHistory()

// 状态
const searchQuery = ref('')
const activeFilter = ref('all')
const showDatePicker = ref(false)
const startDate = ref('')
const endDate = ref('')
const selectedItems = ref(new Set())
const historyListRef = ref(null)

// historyItems 直接使用 browsingHistory
const historyItems = browsingHistory

// 历史记录总数
const historyCount = computed(() => historyItems.value.length)

// 筛选标题
const filterTitle = computed(() => {
  const titles = {
    'all': '全部',
    '1h': '最近 1 小时',
    '4h': '最近 4 小时',
    '1d': '最近 1 天',
    '7d': '最近 7 天',
    'older': '7 天前'
  }
  return titles[activeFilter.value] || '筛选结果'
})

// 设置筛选
const setFilter = (filter) => {
  activeFilter.value = filter
  // 清除自定义日期筛选
  if (filter !== 'custom') {
    startDate.value = ''
    endDate.value = ''
  }
}

// 过滤后的历史记录
const filteredHistory = computed(() => {
  let items = [...historyItems.value]

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(item =>
      (item.title && item.title.toLowerCase().includes(query)) ||
      (item.url && item.url.toLowerCase().includes(query))
    )
  }

  // 快速时间筛选
  const now = Date.now()
  switch (activeFilter.value) {
    case '1h':
      items = items.filter(item => {
        const visitTime = typeof item.visitTime === 'string' ? parseInt(item.visitTime) : item.visitTime
        return visitTime >= now - 60 * 60 * 1000
      })
      break
    case '4h':
      items = items.filter(item => {
        const visitTime = typeof item.visitTime === 'string' ? parseInt(item.visitTime) : item.visitTime
        return visitTime >= now - 4 * 60 * 60 * 1000
      })
      break
    case '1d':
      items = items.filter(item => {
        const visitTime = typeof item.visitTime === 'string' ? parseInt(item.visitTime) : item.visitTime
        return visitTime >= now - 24 * 60 * 60 * 1000
      })
      break
    case '7d':
      items = items.filter(item => {
        const visitTime = typeof item.visitTime === 'string' ? parseInt(item.visitTime) : item.visitTime
        return visitTime >= now - 7 * 24 * 60 * 60 * 1000
      })
      break
    case 'older':
      items = items.filter(item => {
        const visitTime = typeof item.visitTime === 'string' ? parseInt(item.visitTime) : item.visitTime
        return visitTime < now - 7 * 24 * 60 * 60 * 1000
      })
      break
  }
  
  // 自定义日期过滤
  if (startDate.value) {
    const start = new Date(startDate.value).getTime()
    items = items.filter(item => item.visitTime >= start)
  }
  if (endDate.value) {
    const end = new Date(endDate.value).getTime() + 86400000 // 包含当天
    items = items.filter(item => item.visitTime < end)
  }
  
  return items
})

// 按日期分组的历史记录
const groupedHistory = computed(() => {
  const groups = {}
  filteredHistory.value.forEach(item => {
    const date = new Date(item.visitTime).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(item)
  })
  return groups
})

// 格式化日期头部
const formatDateHeader = (dateStr) => {
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  
  if (dateStr === today) {
    const weekday = new Date().toLocaleDateString('zh-CN', { weekday: 'long' })
    return `今天 - ${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}${weekday}`
  }
  if (dateStr === yesterday) {
    return `昨天 - ${new Date(Date.now() - 86400000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}`
  }
  
  const date = new Date(dateStr.replace(/\//g, '-'))
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' })
  return `${date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}${weekday}`
}

// 格式化时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

// 处理图标加载失败
const handleFaviconError = (event, item) => {
  item.favicon = ''
}

// 切换选择
const toggleSelection = (id) => {
  const newSet = new Set(selectedItems.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedItems.value = newSet
}

// 是否全选
const isAllSelected = computed(() => {
  if (filteredHistory.value.length === 0) return false
  return filteredHistory.value.every(item => selectedItems.value.has(item.id))
})

// 切换全选
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedItems.value = new Set()
  } else {
    selectedItems.value = new Set(filteredHistory.value.map(item => item.id))
  }
}

// 删除选中的历史记录
const deleteSelectedHistory = async () => {
  if (selectedItems.value.size === 0) return

  await removeHistoryItems(Array.from(selectedItems.value))
  selectedItems.value = new Set()
}

// 删除单条记录
const deleteSingleItem = async (id) => {
  await removeHistoryItem(id)
  selectedItems.value.delete(id)
}

// 打开历史记录项
const openHistoryItem = (item) => {
  emit('navigate', item.url)
}

// 清除日期筛选
const clearDateFilter = () => {
  startDate.value = ''
  endDate.value = ''
  showDatePicker.value = false
}

// 应用日期筛选
const applyDateFilter = () => {
  showDatePicker.value = false
}

// 初始化
onMounted(() => {
  loadHistory()
})

// 暴露方法供外部调用
defineExpose({
  loadHistory
})
</script>

<style scoped>
.browsing-history {
  display: flex;
  height: 100%;
  background: #1e1e1e;
  color: rgba(255, 255, 255, 0.9);
}

/* 左侧边栏 */
.history-sidebar {
  width: 220px;
  min-width: 220px;
  background: #252526;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.sidebar-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  line-height: 1;
}

.sidebar-menu {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
  transition: all 0.2s;
  font-size: 14px;
}

.sidebar-item span {
  flex: 1;
}

.sidebar-item svg {
  flex-shrink: 0;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sidebar-item.active {
  background: #667eea;
  color: #fff;
}

.item-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  flex: none !important;
}

.sidebar-item.active .item-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* 搜索框 - 移到右侧工具栏 */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 220px;
  height: 32px;
  box-sizing: border-box;
  margin-bottom: 0 !important;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

/* 右侧内容区 */
.history-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.history-toolbar h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  line-height: 1;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 32px;
}

.toolbar-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  height: 32px;
  box-sizing: border-box;
}

.toolbar-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.toolbar-action-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

.toolbar-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 日期选择器 */
.date-picker-panel {
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 24px;
  align-items: center;
}

.date-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-picker-row label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.date-picker-row input {
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
}

.date-picker-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-primary, .btn-secondary {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  border: none;
  color: #fff;
}

.btn-primary:hover {
  background: #5568d3;
}

.btn-secondary {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* 历史记录列表 */
.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.4);
  gap: 16px;
}

.history-group {
  margin-bottom: 24px;
}

.group-header {
  padding: 12px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  background: #1e1e1e;
  z-index: 1;
}

.group-items {
  margin-top: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.history-item.selected {
  background: rgba(102, 126, 234, 0.1);
}

.history-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #667eea;
}

.history-favicon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: contain;
}

.history-favicon-placeholder {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
}

.history-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.history-title {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-url {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.history-delete-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
}

.history-item:hover .history-delete-btn {
  opacity: 1;
}

.history-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* 底部操作栏 */
.history-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #252525;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.select-all-label input {
  accent-color: #667eea;
}

.selected-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
