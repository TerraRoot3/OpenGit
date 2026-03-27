import { ref, computed, nextTick } from 'vue'

// 单例状态，所有组件共享
const favorites = ref([])

export function useFavorites() {
  // 加载收藏列表
  const loadFavorites = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getBrowserFavorites) {
        const result = await window.electronAPI.getBrowserFavorites()
        if (result.success) {
          // 使用 nextTick 延迟更新，避免在初始化时触发递归更新
          await nextTick()
          const loadedFavorites = result.favorites || []
          
          // 确保每个收藏都有 domain 字段（兼容旧数据）
          favorites.value = loadedFavorites.map(fav => {
            if (!fav.domain && fav.url) {
              try {
                const urlObj = new URL(fav.url)
                fav.domain = urlObj.hostname
              } catch (e) {
                fav.domain = '其他'
              }
            }
            
            // 初始化iconError字段
            if (fav.iconError === undefined) {
              fav.iconError = false
            }
            return fav
          })
        }
      }
    } catch (error) {
      console.error('加载收藏失败:', error)
    }
  }

  // 添加收藏
  const addFavorite = async (title, url, icon) => {
    try {
      if (window.electronAPI && window.electronAPI.addBrowserFavorite) {
        const result = await window.electronAPI.addBrowserFavorite({ title, url, icon })
        if (result.success) {
          await loadFavorites()
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('添加收藏失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 删除收藏
  const removeFavorite = async (id) => {
    try {
      if (window.electronAPI && window.electronAPI.removeBrowserFavorite) {
        const result = await window.electronAPI.removeBrowserFavorite({ id })
        if (result.success) {
          await loadFavorites()
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('删除收藏失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 更新收藏
  const updateFavorite = async (data) => {
    try {
      if (window.electronAPI && window.electronAPI.updateBrowserFavorite) {
        const result = await window.electronAPI.updateBrowserFavorite(data)
        if (result.success) {
          await loadFavorites()
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('更新收藏失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 导出收藏
  const exportFavorites = async () => {
    try {
      if (window.electronAPI && window.electronAPI.exportBrowserFavorites) {
        const result = await window.electronAPI.exportBrowserFavorites()
        if (result.success) {
          alert(`导出成功！\n文件路径: ${result.filePath}\n共导出 ${result.count} 个收藏`)
          return { success: true, filePath: result.filePath, count: result.count }
        } else {
          if (result.message !== '用户取消导出') {
            alert(`导出失败: ${result.message}`)
          }
          return { success: false, message: result.message }
        }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('导出收藏失败:', error)
      alert(`导出失败: ${error.message}`)
      return { success: false, message: error.message }
    }
  }

  // 导入收藏
  const importFavorites = async () => {
    try {
      if (window.electronAPI && window.electronAPI.importBrowserFavorites) {
        const result = await window.electronAPI.importBrowserFavorites()
        if (result.success) {
          // 重新加载收藏列表
          await loadFavorites()
          alert(`导入成功！\n新增: ${result.addedCount} 个\n更新: ${result.updatedCount} 个\n总计: ${result.totalCount} 个收藏`)
          return { 
            success: true, 
            addedCount: result.addedCount, 
            updatedCount: result.updatedCount, 
            totalCount: result.totalCount 
          }
        } else {
          if (result.message !== '用户取消导入') {
            alert(`导入失败: ${result.message}`)
          }
          return { success: false, message: result.message }
        }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('导入收藏失败:', error)
      alert(`导入失败: ${error.message}`)
      return { success: false, message: error.message }
    }
  }

  // 检查 URL 是否已收藏
  const isUrlFavorited = (url) => {
    return favorites.value.some(fav => fav.url === url)
  }

  // 更新收藏排序
  const updateFavoritesOrder = async (orderedIds) => {
    try {
      // 先在本地更新排序（立即反映变化）
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i]
        const fav = favorites.value.find(f => f.id === id)
        if (fav) {
          fav.sortOrder = i
        }
      }
      
      // 保存到存储
      if (window.electronAPI && window.electronAPI.saveBrowserFavoritesOrder) {
        const result = await window.electronAPI.saveBrowserFavoritesOrder(orderedIds)
        if (result.success) {
          console.log('✅ 收藏排序已保存')
        } else {
          console.error('❌ 保存排序失败:', result.message)
        }
        return result
      }
      
      return { success: true }
    } catch (error) {
      console.error('更新收藏排序失败:', error)
      return { success: false, message: error.message }
    }
  }

  return {
    favorites,
    loadFavorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
    updateFavoritesOrder,
    exportFavorites,
    importFavorites,
    isUrlFavorited
  }
}

