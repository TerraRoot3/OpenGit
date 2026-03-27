<template>
  <div class="password-manager-page">
    <!-- 左侧边栏 - 域名分组 -->
    <div class="password-sidebar">
      <div class="sidebar-header">
        <h2>密码管理</h2>
      </div>
      <div class="sidebar-menu">
        <div 
          class="sidebar-item" 
          :class="{ active: selectedDomain === null }"
          @click="selectedDomain = null"
        >
          <Key :size="16" />
          <span>全部</span>
          <span class="item-count">{{ savedPasswords.length }}</span>
        </div>
        <div 
          v-for="group in groupedPasswords" 
          :key="group.domain"
          class="sidebar-item" 
          :class="{ active: selectedDomain === group.domain }"
          @click="selectedDomain = group.domain"
        >
          <Globe :size="16" />
          <span>{{ group.domain }}</span>
          <span class="item-count">{{ group.passwords.length }}</span>
        </div>
      </div>
    </div>
    
    <!-- 右侧内容区 -->
    <div class="password-content">
      <div class="content-header">
        <h3>{{ selectedDomain || '全部' }}</h3>
      </div>
      <div class="content-body">
        <div v-if="displayPasswords.length === 0" class="empty-passwords">
          <Key :size="48" />
          <p>暂无保存的密码</p>
        </div>
        <div v-else class="password-list">
          <div v-for="pwd in displayPasswords" :key="pwd.id" class="password-card">
            <!-- 卡片头部 -->
            <div class="password-card-header">
              <div class="password-card-title">
                <Globe :size="20" />
                <span>{{ pwd.domain }}</span>
              </div>
              <div class="password-card-actions">
                <button class="password-action-btn" @click="handleEditPassword(pwd)" title="编辑">
                  <Edit :size="16" />
                  <span>编辑</span>
                </button>
                <button class="password-action-btn delete" @click="handleDeletePassword(pwd.id)" title="删除">
                  <X :size="16" />
                  <span>删除</span>
                </button>
              </div>
            </div>
            
            <!-- 卡片内容 -->
            <div class="password-card-body">
              <!-- 帐户名称 -->
              <div class="password-field">
                <label>帐户名称</label>
                <div class="password-field-input-wrapper">
                  <input 
                    type="text" 
                    :value="pwd.username" 
                    readonly
                    class="password-field-input"
                  />
                  <button 
                    class="password-field-action" 
                    @click="copyToClipboard(pwd.username)"
                    title="复制"
                  >
                    <Copy :size="14" />
                  </button>
                </div>
              </div>
              
              <!-- 站点 -->
              <div class="password-field">
                <label>站点</label>
                <div class="password-field-input-wrapper">
                  <input 
                    type="text" 
                    :value="`https://${pwd.domain}`" 
                    readonly
                    class="password-field-input"
                  />
                  <button 
                    class="password-field-action" 
                    @click="handleOpenPasswordSite(pwd.domain)"
                    title="打开网站"
                  >
                    <ExternalLink :size="14" />
                  </button>
                </div>
              </div>
              
              <!-- 密码 -->
              <div class="password-field">
                <label>密码</label>
                <div class="password-field-input-wrapper">
                  <input 
                    :type="passwordVisible[pwd.id] ? 'text' : 'password'" 
                    :value="pwd.password" 
                    readonly
                    class="password-field-input"
                  />
                  <button 
                    class="password-field-action" 
                    @click="togglePasswordVisibility(pwd.id)"
                    :title="passwordVisible[pwd.id] ? '隐藏密码' : '显示密码'"
                  >
                    <Eye v-if="!passwordVisible[pwd.id]" :size="14" />
                    <EyeOff v-else :size="14" />
                  </button>
                  <button 
                    class="password-field-action" 
                    @click="copyToClipboard(pwd.password)"
                    title="复制"
                  >
                    <Copy :size="14" />
                  </button>
                </div>
              </div>
              
              <!-- 备注 -->
              <div class="password-field">
                <label>备注</label>
                <div class="password-field-input-wrapper">
                  <input 
                    type="text" 
                    v-model="passwordNotes[pwd.id]"
                    @blur="savePasswordNote(pwd.id, passwordNotes[pwd.id])"
                    placeholder="未添加任何备注"
                    class="password-field-input"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 密码编辑对话框 -->
    <PasswordSaveDialog
      :visible="showPasswordSaveDialog"
      :data="passwordSaveData"
      @confirm="handleConfirmSavePassword"
      @cancel="cancelSavePassword"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Key, Globe, Edit, X, Copy, Eye, EyeOff, ExternalLink } from 'lucide-vue-next'
import PasswordSaveDialog from '../dialog/PasswordSaveDialog.vue'
import { usePasswords } from '../../composables/usePasswords'
import { useConfirm } from '../../composables/useConfirm.js'

const { confirm } = useConfirm()

const props = defineProps({
  // passwords 现在直接从 composable 获取，不再通过 props 传递
})

const emit = defineEmits(['open-site'])

// 使用 composable
const { savedPasswords, deletePassword, updatePassword } = usePasswords()

// 当前选中的域名
const selectedDomain = ref(null)

// 密码保存对话框状态（用于编辑）
const showPasswordSaveDialog = ref(false)
const passwordSaveData = ref({ username: '', password: '', domain: '', isUpdate: false })

// 密码管理相关状态
const passwordVisible = ref({}) // 每个密码的显示/隐藏状态
const passwordNotes = ref({}) // 每个密码的备注

// 初始化备注
watch(() => savedPasswords.value, (newPasswords) => {
  newPasswords.forEach(pwd => {
    if (!passwordNotes.value[pwd.id]) {
      passwordNotes.value[pwd.id] = pwd.notes || ''
    }
  })
}, { immediate: true })

// 按域名分组密码
const groupedPasswords = computed(() => {
  if (!savedPasswords.value || !Array.isArray(savedPasswords.value) || savedPasswords.value.length === 0) {
    return []
  }
  
  const groups = {}
  savedPasswords.value.forEach(pwd => {
    if (!groups[pwd.domain]) {
      groups[pwd.domain] = []
    }
    groups[pwd.domain].push(pwd)
  })
  // 转换为数组并按域名排序
  return Object.keys(groups).sort().map(domain => ({
    domain,
    // 创建副本再排序，避免修改原始数组
    passwords: [...groups[domain]].sort((a, b) => {
      // 按最后使用时间排序，最近使用的在前
      const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0
      const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0
      return bTime - aTime
    })
  }))
})

// 显示的密码列表（根据选中域名过滤）
const displayPasswords = computed(() => {
  if (selectedDomain.value === null) {
    // 全部密码
    return savedPasswords.value || []
  }
  // 选中域名的密码
  const group = groupedPasswords.value.find(g => g.domain === selectedDomain.value)
  return group ? group.passwords : []
})

// 切换密码显示/隐藏
const togglePasswordVisibility = (passwordId) => {
  passwordVisible.value[passwordId] = !passwordVisible.value[passwordId]
}

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    console.log('✅ 已复制到剪贴板:', text.substring(0, 10) + '...')
  } catch (error) {
    console.error('复制失败:', error)
  }
}

// 打开密码网站
const handleOpenPasswordSite = (domain) => {
  emit('open-site', domain)
}

// 编辑密码
const handleEditPassword = (pwd) => {
  passwordSaveData.value = {
    username: pwd.username,
    password: pwd.password,
    domain: pwd.domain,
    isUpdate: true,
    id: pwd.id
  }
  showPasswordSaveDialog.value = true
}

// 删除密码
const handleDeletePassword = async (id) => {
  const confirmed = await confirm({
    title: '删除密码',
    message: '确定要删除这个密码吗？',
    type: 'danger',
    confirmText: '删除'
  })
  if (!confirmed) {
    return
  }
  await deletePassword(id)
}

// 确认保存密码（编辑）
const handleConfirmSavePassword = async (data) => {
  const { username, password, domain, isUpdate, id } = data
  if (isUpdate && id) {
    await updatePassword(id, username, password, domain)
  }
  showPasswordSaveDialog.value = false
  passwordSaveData.value = { username: '', password: '', domain: '', isUpdate: false }
}

// 取消保存密码
const cancelSavePassword = () => {
  showPasswordSaveDialog.value = false
  passwordSaveData.value = { username: '', password: '', domain: '', isUpdate: false }
}

// 保存密码备注
const savePasswordNote = async (passwordId, note) => {
  // TODO: 实现保存备注到后端
  console.log('保存备注:', passwordId, note)
  passwordNotes.value[passwordId] = note
}

// 确保组件正确暴露
defineExpose({})
</script>

<style scoped>
.password-manager-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  background: #1e1e1e;
  z-index: 1000;
  display: flex;
  pointer-events: auto !important;
  -webkit-app-region: no-drag !important;
}

/* 左侧边栏 */
.password-sidebar {
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
  color: #fff;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* 右侧内容区 */
.password-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-header {
  display: flex;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.content-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #fff;
  line-height: 1;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  pointer-events: auto !important;
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 1001;
}

.empty-passwords {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.5);
  gap: 16px;
}

.empty-passwords p {
  margin: 0;
  font-size: 16px;
}

.password-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.password-card {
  background: #2d2d2d;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  pointer-events: auto !important;
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 1;
}

.password-card * {
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.password-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.password-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  color: #fff;
}

.password-card-actions {
  display: flex;
  gap: 8px;
}

.password-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  -webkit-app-region: no-drag;
}

.password-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.password-action-btn.delete:hover {
  background: rgba(244, 68, 68, 0.2);
  border-color: rgba(244, 68, 68, 0.4);
  color: #f44;
}

.password-card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.password-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.password-field label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  user-select: none;
}

.password-field-input-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 0 8px;
  transition: all 0.2s;
}

.password-field-input-wrapper:focus-within {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

.password-field-input {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 14px;
  outline: none;
  -webkit-app-region: no-drag;
  pointer-events: auto;
  cursor: text;
}

.password-field-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.password-field-input[readonly] {
  cursor: default;
}

.password-field-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s;
  -webkit-app-region: no-drag;
  pointer-events: auto;
}

.password-field-action:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}
</style>

