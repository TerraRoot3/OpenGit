import { ref } from 'vue'

// 单例状态，所有组件共享
const browsingHistory = ref([])

// 获取日期字符串（用于当天去重）
const getDateString = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function useBrowsingHistory() {
  // 加载历史记录
  const loadHistory = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getConfig) {
        const result = await window.electronAPI.getConfig('browsingHistory')
        const data = result?.value || result
        if (Array.isArray(data)) {
          browsingHistory.value = data
          console.log('📜 历史记录已加载，共', browsingHistory.value.length, '条')
        }
      }
    } catch (error) {
      console.error('加载历史记录失败:', error)
    }
  }

  // 保存历史记录
  const saveHistory = async () => {
    try {
      if (window.electronAPI && window.electronAPI.saveConfig) {
        // 转换为普通数组，避免 Proxy 无法序列化
        const historyData = JSON.parse(JSON.stringify(browsingHistory.value))
        await window.electronAPI.saveConfig({
          key: 'browsingHistory',
          value: historyData
        })
        console.log('✅ 历史记录已保存，共', browsingHistory.value.length, '条')
      }
    } catch (error) {
      console.error('保存历史记录失败:', error)
    }
  }

  // 添加历史记录
  const addToHistory = async (url, title, favicon) => {
    // 只保存 http/https 开头的完整 URL
    if (!url || !url.match(/^https?:\/\//i)) {
      console.log('⏭️ 跳过非 HTTP/HTTPS URL:', url)
      return
    }

    try {
      const domain = new URL(url).hostname
      const now = Date.now()
      const todayStr = getDateString(now)

      const historyItem = {
        id: now.toString(),
        url,
        title: title || url,
        favicon: favicon || '',
        domain,
        visitTime: now
      }

      // 检查是否已存在相同 URL 的记录（当天内不重复添加）
      const existingIndex = browsingHistory.value.findIndex(item =>
        item.url === url && getDateString(item.visitTime) === todayStr
      )

      if (existingIndex === -1) {
        browsingHistory.value.unshift(historyItem)
        console.log('📜 添加历史记录:', { url, title, domain, favicon })

        // 限制历史记录数量（最多保存 1000 条）
        if (browsingHistory.value.length > 1000) {
          browsingHistory.value = browsingHistory.value.slice(0, 1000)
        }

        // 保存到配置
        await saveHistory()
      } else {
        // 当天已有记录，更新访问时间、favicon 和标题
        const existing = browsingHistory.value[existingIndex]
        
        // 更新访问时间为最新
        existing.visitTime = now
        existing.id = now.toString()
        
        // 更新 favicon（如果有更好的值）
        if (favicon && !existing.favicon) {
          existing.favicon = favicon
        }
        // 更新标题（如果有更好的值）
        if (title && title !== url && (!existing.title || existing.title === existing.url)) {
          existing.title = title
        }
        
        // 移动到列表最前面
        browsingHistory.value.splice(existingIndex, 1)
        browsingHistory.value.unshift(existing)
        
        await saveHistory()
        console.log('🔄 更新已有记录的访问时间:', url)
      }
    } catch (error) {
      console.error('添加历史记录失败:', error)
    }
  }

  // 删除单条历史记录
  const removeHistoryItem = async (id) => {
    const index = browsingHistory.value.findIndex(item => item.id === id)
    if (index !== -1) {
      browsingHistory.value.splice(index, 1)
      await saveHistory()
    }
  }

  // 删除多条历史记录
  const removeHistoryItems = async (ids) => {
    const idsSet = new Set(ids)
    browsingHistory.value = browsingHistory.value.filter(item => !idsSet.has(item.id))
    await saveHistory()
  }

  // 清空所有历史记录
  const clearHistory = async () => {
    browsingHistory.value = []
    await saveHistory()
  }

  return {
    browsingHistory,
    loadHistory,
    saveHistory,
    addToHistory,
    removeHistoryItem,
    removeHistoryItems,
    clearHistory
  }
}
