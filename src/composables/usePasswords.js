import { ref } from 'vue'

// 单例状态，所有组件共享
const savedPasswords = ref([])

export function usePasswords() {

  // 加载保存的密码
  const loadSavedPasswords = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getBrowserPasswords) {
        const result = await window.electronAPI.getBrowserPasswords()
        if (result.success) {
          savedPasswords.value = result.passwords || []
          console.log('🔐 已加载保存的密码数量:', savedPasswords.value.length)
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('加载保存的密码失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 保存密码
  const savePassword = async (username, password, domain) => {
    try {
      if (window.electronAPI && window.electronAPI.saveBrowserPassword) {
        const result = await window.electronAPI.saveBrowserPassword({
          username,
          password,
          domain
        })
        
        if (result.success) {
          await loadSavedPasswords()
          console.log('密码已保存')
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('保存密码失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 更新密码
  const updatePassword = async (id, username, password, domain) => {
    try {
      if (window.electronAPI && window.electronAPI.updateBrowserPassword) {
        const result = await window.electronAPI.updateBrowserPassword({
          id,
          username,
          password,
          domain
        })
        
        if (result.success) {
          await loadSavedPasswords()
          console.log('密码已更新')
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('更新密码失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 删除密码
  const deletePassword = async (id) => {
    try {
      if (window.electronAPI && window.electronAPI.deleteBrowserPassword) {
        const result = await window.electronAPI.deleteBrowserPassword({ id })
        
        if (result.success) {
          await loadSavedPasswords()
          console.log('密码已删除')
          return { success: true }
        }
        return { success: false, message: result.message }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('删除密码失败:', error)
      return { success: false, message: error.message }
    }
  }

  // 清除所有密码
  const clearAllPasswords = async () => {
    try {
      if (window.electronAPI && window.electronAPI.clearBrowserPasswords) {
        const result = await window.electronAPI.clearBrowserPasswords()
        if (result.success) {
          savedPasswords.value = []
          console.log('✅ 已清除所有密码')
          alert('已清除所有保存的密码')
          return { success: true }
        } else {
          console.error('清除密码失败:', result.message)
          alert('清除密码失败: ' + result.message)
          return { success: false, message: result.message }
        }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('清除密码失败:', error)
      alert('清除密码失败: ' + error.message)
      return { success: false, message: error.message }
    }
  }

  // 按域名删除密码
  const deletePasswordByDomain = async (domain) => {
    try {
      if (window.electronAPI && window.electronAPI.deleteBrowserPasswordByDomain) {
        const result = await window.electronAPI.deleteBrowserPasswordByDomain({ domain })
        if (result.success) {
          await loadSavedPasswords()
          console.log(`✅ 已删除域名 ${domain} 的密码: ${result.deletedCount} 个`)
          alert(`已删除域名 ${domain} 的密码: ${result.deletedCount} 个`)
          return { success: true, deletedCount: result.deletedCount }
        } else {
          console.error('删除密码失败:', result.message)
          alert('删除密码失败: ' + result.message)
          return { success: false, message: result.message }
        }
      }
      return { success: false, message: 'electronAPI 不可用' }
    } catch (error) {
      console.error('删除密码失败:', error)
      alert('删除密码失败: ' + error.message)
      return { success: false, message: error.message }
    }
  }

  // 更新密码使用时间
  const updatePasswordUsed = async (id) => {
    try {
      if (window.electronAPI && window.electronAPI.updateBrowserPasswordUsed) {
        await window.electronAPI.updateBrowserPasswordUsed({ id })
      }
    } catch (error) {
      console.warn('更新密码使用时间失败:', error)
    }
  }

  // 查找密码
  const findPassword = (domain, username) => {
    return savedPasswords.value.find(
      pwd => pwd.domain === domain && pwd.username === username
    )
  }

  return {
    savedPasswords,
    loadSavedPasswords,
    savePassword,
    updatePassword,
    deletePassword,
    clearAllPasswords,
    deletePasswordByDomain,
    updatePasswordUsed,
    findPassword
  }
}

