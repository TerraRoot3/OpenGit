<template>
  <div class="build-config-section">
    <div class="build-config-header">
      <span>构建配置</span>
      <button class="add-btn" @click="addConfig" title="添加环境">
        <Plus :size="16" />
        <span>添加</span>
      </button>
    </div>
    
    <div class="build-config-content">
      <!-- 空状态 -->
      <div v-if="configs.length === 0" class="empty-state">
        <span>暂无配置，点击上方"添加"按钮添加环境</span>
      </div>
      
      <!-- 环境配置列表 -->
      <div 
        v-for="(item, index) in configs" 
        :key="item.id" 
        class="config-item"
      >
        <div class="config-row">
          <!-- 环境名称输入 -->
          <input 
            v-model="item.name"
            type="text"
            placeholder="环境名称"
            class="name-input"
            @input="saveConfig"
            @blur="saveConfig"
          />
          <!-- 地址输入 -->
          <input 
            v-model="item.url"
            type="text"
            placeholder="输入地址..."
            class="url-input"
            @input="saveConfig"
            @blur="saveConfig"
          />
          <!-- 打开按钮 -->
          <button 
            v-if="item.url"
            class="open-btn"
            @click="openUrl(item.url)"
            title="打开地址"
          >
            <ExternalLink :size="16" />
          </button>
          <!-- 删除按钮 -->
          <button 
            class="delete-btn"
            @click="removeConfig(index)"
            title="删除"
          >
            <X :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ExternalLink, Plus, X } from 'lucide-vue-next'

const props = defineProps({
  projectPath: {
    type: String,
    required: true
  }
})

// 配置数据 - 动态数组
const configs = ref([])

// 生成唯一 ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2)

// 当前加载的项目标识（git remote URL 或路径）
let currentIdentifier = ''
// 当前的 git remote URL
let currentRemoteUrl = ''

// 防抖定时器
let saveTimer = null

// 添加新配置
const addConfig = () => {
  configs.value.push({
    id: generateId(),
    name: '',
    url: ''
  })
  // 不自动保存空配置，等用户输入后再保存
}

// 删除配置
const removeConfig = (index) => {
  configs.value.splice(index, 1)
  doSaveConfig()
}

// 获取 Git remote URL
const getGitRemoteUrl = async (projectPath) => {
  try {
    const result = await window.electronAPI?.executeCommand({
      command: `cd "${projectPath}" && git remote get-url origin 2>/dev/null`
    })
    if (result?.success && result.output?.trim()) {
      return result.output.trim()
    }
  } catch (error) {
    console.log('⚠️ [BuildConfig] 获取 remote URL 失败:', error.message)
  }
  return null
}

// 标准化 git URL（去掉 .git 后缀，统一格式）
const normalizeGitUrl = (url) => {
  if (!url) return null
  // 去掉 .git 后缀
  let normalized = url.replace(/\.git$/, '')
  // 将 git@host:path 转换为 host/path 格式（仅用于标识，不用于访问）
  if (normalized.startsWith('git@')) {
    const match = normalized.match(/git@(.+?):(.+)$/)
    if (match) {
      normalized = `${match[1]}/${match[2]}`
    }
  }
  // 去掉协议前缀
  normalized = normalized.replace(/^https?:\/\//, '')
  return normalized.toLowerCase()
}

// 获取存储 key（优先使用 git remote URL，否则使用路径）
const getStorageKey = (identifier) => {
  if (!identifier) return null
  // 使用标识符作为 key（已经是标准化的 URL 或路径）
  return `build-config-${identifier.replace(/[/\\:@]/g, '_')}`
}

// 迁移旧数据格式（test/staging/prod -> 数组）
const migrateOldConfig = (oldConfig) => {
  const result = []
  if (oldConfig.test) {
    result.push({ id: generateId(), name: '测网', url: oldConfig.test })
  }
  if (oldConfig.staging) {
    result.push({ id: generateId(), name: '预发', url: oldConfig.staging })
  }
  if (oldConfig.prod) {
    result.push({ id: generateId(), name: '现网', url: oldConfig.prod })
  }
  return result
}

// 加载配置（使用 Electron store 统一存储）
const loadConfig = async () => {
  const path = props.projectPath
  if (!path) return
  
  // 先获取 git remote URL
  const remoteUrl = await getGitRemoteUrl(path)
  const normalizedUrl = normalizeGitUrl(remoteUrl)
  
  // 检查项目是否已切换
  if (props.projectPath !== path) {
    console.log('⚠️ [BuildConfig] 项目已切换，忽略旧数据')
    return
  }
  
  // 确定使用的标识符：优先 git remote URL，否则用路径
  const identifier = normalizedUrl || path
  const key = getStorageKey(identifier)
  if (!key) return
  
  currentIdentifier = identifier
  currentRemoteUrl = remoteUrl || ''
  
  console.log('📖 [BuildConfig] 加载配置:', key, '(remote:', remoteUrl || '无', ')')
  
  try {
    // 优先使用 Electron store
    if (window.electronAPI?.getConfig) {
      let saved = await window.electronAPI.getConfig(key)
      
      // 如果用 remote URL 没找到，尝试用路径兼容旧数据
      if (!saved && normalizedUrl) {
        const oldKey = `build-config-${path.replace(/[/\\]/g, '_')}`
        saved = await window.electronAPI.getConfig(oldKey)
        if (saved) {
          console.log('🔄 [BuildConfig] 迁移旧数据从路径 key 到 remote URL key')
          // 迁移到新 key
          await window.electronAPI.setConfig(key, saved)
        }
      }
      
      // 再次检查路径是否变化
      if (props.projectPath !== path) {
        console.log('⚠️ [BuildConfig] 项目已切换，忽略旧数据')
        return
      }
      
      if (saved) {
        // 检查是否是旧格式（有 test/staging/prod 属性）
        if (saved.test !== undefined || saved.staging !== undefined || saved.prod !== undefined) {
          console.log('🔄 [BuildConfig] 迁移旧格式数据')
          configs.value = migrateOldConfig(saved)
          // 保存新格式
          doSaveConfig()
        } else if (Array.isArray(saved.configs)) {
          // 新格式
          configs.value = saved.configs.map(item => ({
            id: item.id || generateId(),
            name: item.name || '',
            url: item.url || ''
          }))
        } else {
          configs.value = []
        }
        console.log('✅ [BuildConfig] 已加载配置:', configs.value.length, '项')
        return
      }
    }
    
    // 兼容旧数据：尝试从 localStorage 读取并迁移
    const oldKey = `build-config-${path.replace(/[/\\]/g, '_')}`
    const localSaved = localStorage.getItem(oldKey)
    if (props.projectPath !== path) return
    if (localSaved) {
      const parsed = JSON.parse(localSaved)
      if (parsed.test !== undefined || parsed.staging !== undefined || parsed.prod !== undefined) {
        configs.value = migrateOldConfig(parsed)
      } else if (Array.isArray(parsed.configs)) {
        configs.value = parsed.configs
      } else {
        configs.value = []
      }
      // 迁移到 Electron store（使用新格式）
      doSaveConfig()
    } else {
      configs.value = []
    }
  } catch (error) {
    console.error('加载构建配置失败:', error)
    configs.value = []
  }
}

// 实际保存配置
const doSaveConfig = async () => {
  const key = getStorageKey(currentIdentifier)
  if (!key || !currentIdentifier) return
  
  // 过滤掉空配置（名称和地址都为空）
  const validConfigs = configs.value.filter(item => item.name || item.url)
  
  // 新格式：保存为数组
  const configData = {
    configs: validConfigs.map(item => ({
      id: item.id,
      name: item.name || '',
      url: item.url || ''
    })),
    // 保存 remote URL 用于跨机器恢复
    _remoteUrl: currentRemoteUrl || '',
    _path: props.projectPath || ''
  }
  
  try {
    // 优先使用 Electron store
    if (window.electronAPI?.setConfig) {
      await window.electronAPI.setConfig(key, configData)
      console.log('✅ [BuildConfig] 已保存到 Electron store:', key, validConfigs.length, '项')
    } else {
      // 降级到 localStorage
      localStorage.setItem(key, JSON.stringify(configData))
      console.log('✅ [BuildConfig] 已保存到 localStorage:', key)
    }
  } catch (error) {
    console.error('保存构建配置失败:', error)
  }
}

// 保存配置（带防抖）
const saveConfig = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    doSaveConfig()
  }, 300)
}

// 打开 URL（使用全局方法）
const openUrl = (url) => {
  if (!url) return
  
  // 确保 URL 有协议前缀
  let finalUrl = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = 'https://' + url
  }
  
  console.log('🔗 [BuildConfig] 打开URL:', finalUrl)
  if (window.electronAPI?.openUrlInNewTab) {
    window.electronAPI.openUrlInNewTab(finalUrl)
  }
}

// 监听项目路径变化
watch(() => props.projectPath, async (newPath, oldPath) => {
  // 先保存当前项目的配置（如果有变化）
  if (oldPath && saveTimer) {
    clearTimeout(saveTimer)
    await doSaveConfig()
  }
  // 重置标识符
  currentIdentifier = ''
  currentRemoteUrl = ''
  // 加载新项目的配置
  loadConfig()
}, { immediate: true })
</script>

<style scoped>
.build-config-section {
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.build-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 4px;
  color: #4ade80;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.add-btn:hover {
  background: rgba(34, 197, 94, 0.3);
  border-color: rgba(34, 197, 94, 0.5);
}

.build-config-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.config-item {
  display: flex;
  flex-direction: column;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-input {
  width: 80px;
  min-width: 80px;
  height: 32px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.name-input:focus {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(255, 255, 255, 0.1);
}

.name-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
  font-weight: 400;
}

.url-input {
  flex: 1;
  height: 32px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.url-input:focus {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

.url-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.open-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(102, 126, 234, 0.2);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 6px;
  color: #667eea;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  box-sizing: border-box;
}

.open-btn:hover {
  background: rgba(102, 126, 234, 0.3);
  border-color: rgba(102, 126, 234, 0.5);
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  color: #f87171;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  box-sizing: border-box;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.4);
}
</style>
