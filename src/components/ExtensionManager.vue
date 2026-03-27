<template>
  <div class="extension-manager">
    <!-- 左侧边栏 -->
    <div class="extension-sidebar">
      <h2>扩展管理</h2>
      <div class="sidebar-menu">
        <div 
          class="sidebar-item" 
          :class="{ active: activeTab === 'installed' }"
          @click="activeTab = 'installed'"
        >
          <Package :size="16" />
          <span>已安装</span>
          <span class="badge" v-if="extensions.length">{{ extensions.length }}</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeTab === 'add' }"
          @click="activeTab = 'add'"
        >
          <Plus :size="16" />
          <span>添加扩展</span>
        </div>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="extension-content">
      <!-- 已安装扩展列表 -->
      <div v-if="activeTab === 'installed'" class="installed-panel">
        <div class="panel-header">
          <h3>已安装的扩展</h3>
          <p class="panel-desc">管理已加载的 Chrome 扩展</p>
        </div>

        <div v-if="isLoading" class="loading-state">
          <Loader :size="32" class="spin" />
          <span>加载扩展列表...</span>
        </div>

        <div v-else-if="extensions.length === 0" class="empty-state">
          <Package :size="48" />
          <p>暂无已安装的扩展</p>
          <button class="btn-primary" @click="activeTab = 'add'">
            <Plus :size="16" />
            <span>添加扩展</span>
          </button>
        </div>

        <div v-else class="extension-list">
          <div 
            v-for="ext in extensions" 
            :key="ext.id" 
            class="extension-card"
            :class="{ disabled: !ext.enabled }"
          >
            <div class="extension-icon">
              <img v-if="ext.icon" :src="ext.icon" alt="" />
              <Puzzle v-else :size="32" />
            </div>
            <div class="extension-info">
              <div class="extension-name">{{ ext.name }}</div>
              <div class="extension-version">版本 {{ ext.version }}</div>
              <div class="extension-desc" v-if="ext.description">{{ ext.description }}</div>
            </div>
            <div class="extension-actions">
              <button 
                class="btn-icon" 
                :title="ext.enabled ? '禁用' : '启用'"
                @click="toggleExtension(ext)"
              >
                <ToggleLeft v-if="!ext.enabled" :size="20" />
                <ToggleRight v-else :size="20" class="active" />
              </button>
              <button 
                class="btn-icon danger" 
                title="卸载扩展"
                @click="removeExtension(ext)"
              >
                <Trash2 :size="18" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 添加扩展 -->
      <div v-if="activeTab === 'add'" class="add-panel">
        <div class="panel-header">
          <h3>添加扩展</h3>
          <p class="panel-desc">支持多种方式加载 Chrome 扩展</p>
        </div>

        <div class="add-methods">
          <!-- 从 Chrome 已安装扩展加载 -->
          <div class="add-method-card" @click="loadFromChrome">
            <div class="method-icon chrome">
              <Chrome :size="48" />
            </div>
            <div class="method-info">
              <h4>从 Chrome 加载</h4>
              <p>自动检测并加载 Chrome 已安装的扩展</p>
            </div>
            <ChevronRight :size="24" />
          </div>

          <!-- 通过扩展 ID 安装 -->
          <div class="add-method-card" @click="showExtensionIdInput = true">
            <div class="method-icon">
              <Hash :size="48" />
            </div>
            <div class="method-info">
              <h4>通过扩展 ID 加载</h4>
              <p>输入 Chrome 扩展 ID 快速加载</p>
            </div>
            <ChevronRight :size="24" />
          </div>

          <!-- 从文件夹加载 -->
          <div class="add-method-card" @click="loadFromFolder">
            <div class="method-icon">
              <FolderOpen :size="48" />
            </div>
            <div class="method-info">
              <h4>从文件夹加载</h4>
              <p>选择包含 manifest.json 的扩展目录</p>
            </div>
            <ChevronRight :size="24" />
          </div>

          <!-- Chrome 应用商店 -->
          <div class="add-method-card store" @click="openChromeWebStore">
            <div class="method-icon store">
              <ShoppingBag :size="48" />
            </div>
            <div class="method-info">
              <h4>Chrome 应用商店</h4>
              <p>在系统浏览器中打开（需要 Google 账户）</p>
            </div>
            <ExternalLink :size="24" />
          </div>

        </div>

        <!-- 扩展 ID 输入框 -->
        <div v-if="showExtensionIdInput" class="extension-id-input">
          <h4>输入扩展 ID</h4>
          <p class="input-hint">
            在 Chrome 中打开 <code>chrome://extensions</code>，找到扩展的 ID（如：fmkadmapgofadopljbjfkapdkoienihi）
          </p>
          <div class="input-row">
            <input 
              v-model="extensionIdInput" 
              type="text" 
              placeholder="输入扩展 ID..."
              @keyup.enter="loadByExtensionId"
            />
            <button class="btn-primary" @click="loadByExtensionId" :disabled="!extensionIdInput.trim() || isLoadingById">
              <Loader v-if="isLoadingById" :size="16" class="spin" />
              <span v-else>加载</span>
            </button>
            <button class="btn-cancel" @click="showExtensionIdInput = false; extensionIdInput = ''">
              取消
            </button>
          </div>
        </div>

        <div class="add-tips">
          <h4><AlertCircle :size="16" /> 注意事项</h4>
          <ul>
            <li><strong>仅支持未打包的扩展</strong>（不支持 .crx 文件）</li>
            <li>需要先在 Chrome 中安装扩展，然后通过扩展 ID 加载</li>
            <li>支持的 API：chrome.runtime、chrome.storage.local、chrome.tabs（部分）、chrome.webRequest 等</li>
            <li>不支持：chrome.storage.sync、chrome.storage.managed、<strong>Manifest V3 的 declarativeNetRequest</strong></li>
            <li><strong>⚠️ 广告拦截扩展</strong>：仅支持 Manifest V2 版本，加载后需<strong>刷新页面</strong>才能生效</li>
            <li>已验证可用：React DevTools、Vue.js devtools、Redux DevTools 等（<a href="https://www.electronjs.org/zh/docs/latest/api/extensions" target="_blank">查看完整列表</a>）</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 结果提示 -->
    <div v-if="resultMessage" class="result-toast" :class="resultType">
      <CheckCircle v-if="resultType === 'success'" :size="20" />
      <AlertCircle v-else :size="20" />
      <span>{{ resultMessage }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { 
  Package, Plus, Puzzle, ToggleLeft, ToggleRight, Trash2,
  FolderOpen, ChevronRight, AlertCircle, CheckCircle, Loader,
  Chrome, Hash, ShoppingBag, ExternalLink
} from 'lucide-vue-next'
import { useConfirm } from '../composables/useConfirm.js'

const { confirm } = useConfirm()

const emit = defineEmits(['navigate'])

// 当前标签页
const activeTab = ref('installed')

// 扩展列表
const extensions = ref([])

// 状态
const isLoading = ref(false)
const resultMessage = ref('')
const resultType = ref('success')
const showExtensionIdInput = ref(false)
const extensionIdInput = ref('')
const isLoadingById = ref(false)

// 显示结果消息
const showResult = (message, type = 'success') => {
  resultMessage.value = message
  resultType.value = type
  setTimeout(() => {
    resultMessage.value = ''
  }, 3000)
}

// 加载扩展列表
const loadExtensions = async () => {
  isLoading.value = true
  try {
    if (window.electronAPI && window.electronAPI.getExtensions) {
      const result = await window.electronAPI.getExtensions()
      if (result.success) {
        extensions.value = result.extensions || []
      }
    }
  } catch (error) {
    console.error('加载扩展列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 从文件夹加载扩展
const loadFromFolder = async () => {
  try {
    if (window.electronAPI && window.electronAPI.loadExtensionFromFolder) {
      const result = await window.electronAPI.loadExtensionFromFolder()
      if (result.success) {
        showResult(`扩展 "${result.extension.name}" 加载成功！`)
        await loadExtensions()
        activeTab.value = 'installed'
      } else if (result.message !== '用户取消选择') {
        showResult(result.message || '加载扩展失败', 'error')
      }
    }
  } catch (error) {
    console.error('加载扩展失败:', error)
    showResult('加载扩展失败: ' + error.message, 'error')
  }
}

// 从 CRX 文件加载扩展
// 从 Chrome 已安装扩展加载
const loadFromChrome = async () => {
  try {
    if (window.electronAPI && window.electronAPI.loadExtensionFromChrome) {
      showResult('正在扫描 Chrome 扩展...', 'success')
      const result = await window.electronAPI.loadExtensionFromChrome()
      if (result.success) {
        if (result.extensions && result.extensions.length > 0) {
          showResult(`成功加载 ${result.extensions.length} 个扩展！`)
          await loadExtensions()
          activeTab.value = 'installed'
        } else {
          showResult('未找到可用的 Chrome 扩展', 'error')
        }
      } else {
        showResult(result.message || '扫描 Chrome 扩展失败', 'error')
      }
    }
  } catch (error) {
    console.error('从 Chrome 加载扩展失败:', error)
    showResult('从 Chrome 加载扩展失败: ' + error.message, 'error')
  }
}

// 通过扩展 ID 加载
const loadByExtensionId = async () => {
  const extensionId = extensionIdInput.value.trim()
  if (!extensionId) return
  
  isLoadingById.value = true
  try {
    if (window.electronAPI && window.electronAPI.loadExtensionById) {
      const result = await window.electronAPI.loadExtensionById(extensionId)
      if (result.success) {
        showResult(`扩展 "${result.extension.name}" 加载成功！`)
        await loadExtensions()
        activeTab.value = 'installed'
        showExtensionIdInput.value = false
        extensionIdInput.value = ''
      } else {
        showResult(result.message || '加载扩展失败', 'error')
      }
    }
  } catch (error) {
    console.error('通过 ID 加载扩展失败:', error)
    showResult('加载扩展失败: ' + error.message, 'error')
  } finally {
    isLoadingById.value = false
  }
}

// 打开 Chrome 应用商店（使用系统浏览器，因为应用商店需要 Google 登录等完整 Chrome 功能）
const openChromeWebStore = () => {
  if (window.electronAPI && window.electronAPI.openExternal) {
    window.electronAPI.openExternal('https://chromewebstore.google.com/category/extensions?utm_source=ext_sidebar&hl=zh-CN')
  }
}

// 切换扩展启用状态
const toggleExtension = async (ext) => {
  try {
    if (window.electronAPI && window.electronAPI.toggleExtension) {
      const result = await window.electronAPI.toggleExtension(ext.id, !ext.enabled)
      if (result.success) {
        ext.enabled = !ext.enabled
        showResult(`扩展已${ext.enabled ? '启用' : '禁用'}`)
      } else {
        showResult(result.message || '操作失败', 'error')
      }
    }
  } catch (error) {
    console.error('切换扩展状态失败:', error)
    showResult('操作失败: ' + error.message, 'error')
  }
}

// 卸载扩展
const removeExtension = async (ext) => {
  const confirmed = await confirm({
    title: '卸载扩展',
    message: `确定要卸载扩展 "${ext.name}" 吗？`,
    type: 'danger',
    confirmText: '卸载'
  })
  if (!confirmed) return
  
  try {
    if (window.electronAPI && window.electronAPI.removeExtension) {
      const result = await window.electronAPI.removeExtension(ext.id)
      if (result.success) {
        showResult(`扩展 "${ext.name}" 已卸载`)
        await loadExtensions()
      } else {
        showResult(result.message || '卸载失败', 'error')
      }
    }
  } catch (error) {
    console.error('卸载扩展失败:', error)
    showResult('卸载失败: ' + error.message, 'error')
  }
}

onMounted(() => {
  loadExtensions()
})
</script>

<style scoped>
.extension-manager {
  display: flex;
  height: 100%;
  background: #1e1e1e;
  color: rgba(255, 255, 255, 0.9);
  position: relative;
}

/* 左侧边栏 */
.extension-sidebar {
  width: 200px;
  background: #252525;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}

.extension-sidebar h2 {
  font-size: 20px;
  font-weight: 600;
  padding: 0 20px 20px;
  margin: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-menu {
  padding: 12px 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s;
  color: rgba(255, 255, 255, 0.7);
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
}

.sidebar-item.active {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
}

.sidebar-item .badge {
  margin-left: auto;
  background: rgba(64, 158, 255, 0.3);
  color: #409eff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

/* 右侧内容区 */
.extension-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.panel-header {
  margin-bottom: 24px;
}

.panel-header h3 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px;
}

.panel-desc {
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.5);
  gap: 16px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.5);
  gap: 16px;
}

.empty-state p {
  margin: 0;
}

/* 扩展列表 */
.extension-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.extension-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #2d2d2d;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
}

.extension-card:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.extension-card.disabled {
  opacity: 0.6;
}

.extension-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  flex-shrink: 0;
}

.extension-icon img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.extension-info {
  flex: 1;
  min-width: 0;
}

.extension-name {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 4px;
}

.extension-version {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.extension-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extension-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.btn-icon.danger:hover {
  background: rgba(245, 108, 108, 0.2);
  color: #f56c6c;
}

.btn-icon .active {
  color: #67c23a;
}

/* 添加扩展面板 */
.add-methods {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.add-method-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #2d2d2d;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.add-method-card:hover {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}

.method-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(64, 158, 255, 0.15);
  border-radius: 12px;
  color: #409eff;
}

.method-info {
  flex: 1;
}

.method-info h4 {
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 4px;
}

.method-info p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* 提示信息 */
.add-tips {
  padding: 16px;
  background: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.3);
  border-radius: 8px;
}

.add-tips h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
  color: #e6a23c;
}

.add-tips ul {
  margin: 0;
  padding-left: 20px;
  color: rgba(255, 255, 255, 0.7);
}

.add-tips li {
  margin-bottom: 6px;
  font-size: 13px;
}

.add-tips li:last-child {
  margin-bottom: 0;
}

/* 按钮 */
.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #409eff;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #66b1ff;
}

.btn-primary:disabled {
  background: rgba(64, 158, 255, 0.5);
  cursor: not-allowed;
}

.btn-cancel {
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Chrome 图标样式 */
.method-icon.chrome {
  background: rgba(66, 133, 244, 0.15);
  color: #4285f4;
}

.method-icon.store {
  background: rgba(234, 67, 53, 0.15);
  color: #ea4335;
}

.add-method-card.store:hover {
  border-color: #ea4335;
  background: rgba(234, 67, 53, 0.1);
}

/* 扩展 ID 输入框 */
.extension-id-input {
  margin-top: 20px;
  padding: 20px;
  background: #2d2d2d;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.extension-id-input h4 {
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 8px;
}

.input-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 16px;
}

.input-hint code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.input-row {
  display: flex;
  gap: 12px;
}

.input-row input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.input-row input:focus {
  border-color: #409eff;
}

.input-row input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.add-tips a {
  color: #409eff;
  text-decoration: none;
}

.add-tips a:hover {
  text-decoration: underline;
}

/* 结果提示 */
.result-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

.result-toast.success {
  background: rgba(103, 194, 58, 0.9);
  color: #fff;
}

.result-toast.error {
  background: rgba(245, 108, 108, 0.9);
  color: #fff;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>

