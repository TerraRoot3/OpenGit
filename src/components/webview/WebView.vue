<template>
  <webview
    ref="webviewRef"
    :data-tab-id="tabId"
    class="webview"
    :style="webviewStyle"
    partition="persist:main"
    allowpopups
    webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=yes,allowRunningInsecureContent=no"
    @did-start-loading="onLoadStart"
    @did-stop-loading="onLoadStop"
    @will-navigate="onWillNavigate"
    @did-navigate="onNavigate"
    @did-navigate-in-page="onNavigateInPage"
    @page-title-updated="onTitleUpdated"
    @page-favicon-updated="onFaviconUpdated"
    @new-window="onNewWindow"
    @dom-ready="onDomReady"
    @did-fail-load="onLoadFail"
  ></webview>
  
  <!-- 密码保存对话框 -->
  <PasswordSaveDialog
    :visible="showPasswordSaveDialog"
    :data="passwordSaveData"
    @confirm="handleConfirmSavePassword"
    @cancel="cancelSavePassword"
  />
  
  <!-- 右键菜单 -->
  <Teleport to="body">
    <!-- 透明遮罩层，点击关闭菜单 -->
    <div 
      v-if="contextMenuVisible" 
      class="context-menu-overlay"
      @click="contextMenuVisible = false"
      @contextmenu.prevent="contextMenuVisible = false"
    ></div>
    <div 
      v-if="contextMenuVisible" 
      class="webview-context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
    >
      <div class="context-menu-item" @click="handleContextMenuAction('back')">
        ← 后退
      </div>
      <div class="context-menu-item" @click="handleContextMenuAction('forward')">
        → 前进
      </div>
      <div class="context-menu-item" @click="handleContextMenuAction('reload')">
        ↻ 刷新
      </div>
      <div class="context-menu-divider"></div>
      <div 
        v-if="contextMenuParams?.selectionText" 
        class="context-menu-item" 
        @click="handleContextMenuAction('copy')"
      >
        复制
      </div>
      <div 
        v-if="contextMenuParams?.linkURL" 
        class="context-menu-item" 
        @click="handleContextMenuAction('copy-link')"
      >
        复制链接
      </div>
      <div 
        v-if="contextMenuParams?.linkURL" 
        class="context-menu-item" 
        @click="handleContextMenuAction('open-link')"
      >
        在新标签页打开
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="handleContextMenuAction('inspect')">
        检查元素
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import PasswordSaveDialog from '../dialog/PasswordSaveDialog.vue'
import { usePasswords } from '../../composables/usePasswords'

// 标记组件是否已卸载，防止异步操作访问已卸载的组件
let isUnmounted = false

const props = defineProps({
  tabId: {
    type: Number,
    required: true
  },
  src: {
    type: String,
    default: 'about:blank'
  },
  userAgent: {
    type: String,
    default: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  // 当前标签是否是活动标签
  isActive: {
    type: Boolean,
    default: false
  }
  // savedPasswords 现在直接从 composable 获取，不再通过 props 传递
})

// 计算 webview 的内联样式 - 非活动时完全隐藏
const webviewStyle = computed(() => {
  if (props.isActive) {
    return {
      width: '100%',
      height: '100%',
      border: 'none'
    }
  }
  // 非活动时完全隐藏 webview
  return {
    visibility: 'hidden',
    position: 'absolute',
    left: '-9999px',
    top: '-9999px',
    width: '0',
    height: '0',
    pointerEvents: 'none'
  }
})

const emit = defineEmits([
  'did-start-loading',
  'did-stop-loading',
  'did-navigate',
  'did-navigate-in-page',
  'page-title-updated',
  'new-window',
  'dom-ready',
  'did-fail-load',
  'webview-ready',
  'navigation-state-changed', // 新增：导航状态变化（canGoBack, canGoForward）
  'title-updated', // 新增：标题更新
  'favicon-updated', // 新增：favicon 更新
  'loading-progress', // 新增：加载进度
  'password-filled' // 新增：密码已填充
])

const webviewRef = ref(null)
const isWebviewReady = ref(false)
let passwordCaptureInterval = null
let passwordCaptureStopTimeout = null
const activeTimeouts = new Set() // 用于跟踪所有活动的定时器
let hasFavicon = false // 标记是否已通过内置事件获取到 favicon
const lastSetSrc = ref('') // 记录上次设置的 src，避免重复设置导致刷新（使用 ref 确保每个组件实例独立）

// 使用 composable
const { savedPasswords, savePassword, updatePassword, findPassword } = usePasswords()

// 密码保存对话框状态
const showPasswordSaveDialog = ref(false)
const passwordSaveData = ref({ username: '', password: '', domain: '', isUpdate: false })
const filledPassword = ref(null) // 记录已填充的密码信息

// 获取 webview 实例
const getWebview = () => {
  return webviewRef.value
}

// 打开 webview 的 DevTools
const openWebviewDevTools = () => {
  const webview = getWebview()
  if (webview) {
    try {
      // webview 的 openDevTools 不支持 options，只能以独立窗口方式打开
      webview.openDevTools()
      console.log('🔧 打开 webview DevTools, tabId:', props.tabId)
    } catch (err) {
      console.error('无法打开 webview DevTools:', err)
    }
  }
}

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuParams = ref(null)

// 显示右键菜单
const showContextMenu = (e) => {
  contextMenuParams.value = e.params
  contextMenuX.value = e.params.x
  contextMenuY.value = e.params.y
  contextMenuVisible.value = true
}

// 右键菜单操作
const handleContextMenuAction = (action) => {
  contextMenuVisible.value = false
  
  const webview = getWebview()
  if (!webview) return
  
  switch (action) {
    case 'inspect':
      openWebviewDevTools()
      break
    case 'copy':
      if (contextMenuParams.value?.selectionText) {
        navigator.clipboard.writeText(contextMenuParams.value.selectionText)
      }
      break
    case 'copy-link':
      if (contextMenuParams.value?.linkURL) {
        navigator.clipboard.writeText(contextMenuParams.value.linkURL)
      }
      break
    case 'open-link':
      if (contextMenuParams.value?.linkURL) {
        emit('new-window', { url: contextMenuParams.value.linkURL }, props.tabId)
      }
      break
    case 'back':
      if (webview.canGoBack()) webview.goBack()
      break
    case 'forward':
      if (webview.canGoForward()) webview.goForward()
      break
    case 'reload':
      webview.reload()
      break
  }
}

// 监听 src 变化 - 手动控制 webview.src，避免 Vue 重新渲染时重复设置导致刷新
watch(() => props.src, (newSrc, oldSrc) => {
  // 忽略无效的 src
  if (!newSrc || newSrc === '' || newSrc === 'about:blank' || newSrc === 'about:blank#blocked') {
    return
  }
  
  // 如果和上次设置的 src 相同，跳过（避免重复设置导致刷新）
  if (newSrc === lastSetSrc.value) {
    return
  }
  
  const webview = getWebview()
  if (!webview) {
    return
  }
  
  // 检查 webview 当前的 src
  try {
    const currentSrc = webview.src || ''
    if (currentSrc === newSrc) {
      lastSetSrc.value = newSrc
      return
    }
  } catch (e) {
    // 静默失败
  }
  
  lastSetSrc.value = newSrc
  webview.src = newSrc
}, { immediate: true })

// 监听 savedPasswords 变化，自动填充密码
watch(() => savedPasswords.value, (newVal) => {
  if (isWebviewReady.value && newVal && newVal.length > 0) {
    setTimeout(() => {
      if (getWebview()) {
        checkAndFillPassword()
      }
    }, 200)
  }
}, { deep: true, immediate: true })

watch(() => props.isActive, async (active) => {
  if (!active) {
    stopPasswordCapturePolling()
    return
  }
  const webview = getWebview()
  if (!webview) return
  try {
    const currentUrl = webview.getURL()
    if (isLoginLikeUrl(currentUrl)) {
      setupPasswordSaveListener()
      startPasswordCapturePolling()
    }
  } catch (e) {
    // ignore
  }
})

// 更新导航状态
const updateNavigationState = () => {
  const webview = getWebview()
  if (webview) {
    try {
      const canGoBack = webview.canGoBack()
      const canGoForward = webview.canGoForward()
      emit('navigation-state-changed', { canGoBack, canGoForward }, props.tabId)
    } catch (e) {
      console.warn('⚠️ 无法读取 webview 导航状态:', e)
    }
  }
}

// 获取 favicon - 简化版本，直接使用默认 favicon.ico
const getFavicon = async () => {
  const webview = getWebview()
  if (!webview) return null
  
  try {
    let currentUrl
    try {
      currentUrl = webview.src
    } catch (e) {
      return null
    }
    
    if (!currentUrl || !currentUrl.startsWith('http')) {
      return null
    }
    
    // 直接使用 /favicon.ico，简单快速
    const urlObj = new URL(currentUrl)
    const faviconUrl = urlObj.origin + '/favicon.ico'
    emit('favicon-updated', faviconUrl, props.tabId)
    return faviconUrl
  } catch (e) {
    return null
  }
}

// 原始复杂的 getFavicon（保留但不再使用）
const getFaviconComplex = async (retryCount = 0) => {
  const webview = getWebview()
  if (!webview) {
    return null
  }
  
  try {
    let currentUrl
      try {
        currentUrl = webview.src
    } catch (e) {
        return null
    }
    
    if (!currentUrl || !currentUrl.startsWith('http')) {
      return null
    }
    
    // 直接使用默认 favicon.ico
    if (retryCount >= 1) {
      try {
        const urlObj = new URL(currentUrl)
        const defaultFavicon = urlObj.origin + '/favicon.ico'
        emit('favicon-updated', defaultFavicon, props.tabId)
        return defaultFavicon
      } catch (e) {
        return null
      }
    }
    
    const script = `
      (function() {
        try {
          function normalizeFaviconUrl(href) {
            if (!href) return null
            if (href.startsWith('http://') || href.startsWith('https://')) {
              return href
            } else if (href.startsWith('//')) {
              return window.location.protocol + href
            } else if (href.startsWith('/')) {
              return window.location.origin + href
            } else {
              try {
                return new URL(href, window.location.href).href
              } catch (e) {
                return window.location.origin + '/' + href
              }
            }
          }
          
          const selectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="Shortcut Icon"]',
            'link[rel="SHORTCUT ICON"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[rel*="icon" i]',
            'link[rel*="Icon" i]',
            'link[rel*="ICON" i]'
          ]
          
          for (let selector of selectors) {
            try {
              const icons = document.querySelectorAll(selector)
              for (let icon of icons) {
                if (icon) {
                  // 尝试多种方式获取 href
                  let href = icon.href || icon.getAttribute('href')
                  if (href) {
                    const normalized = normalizeFaviconUrl(href)
                    if (normalized) {
                      return normalized
                    }
                  }
                }
              }
            } catch (e) {
              // 继续尝试下一个选择器
            }
          }
          
          // 方法2: 尝试从 head 中查找所有 link 标签
          try {
            const allLinks = document.querySelectorAll('head link[rel]')
            for (let link of allLinks) {
              const rel = link.getAttribute('rel')
              if (rel && (rel.toLowerCase().includes('icon') || rel.toLowerCase() === 'shortcut icon')) {
                let href = link.href || link.getAttribute('href')
                if (href) {
                  const normalized = normalizeFaviconUrl(href)
                  if (normalized) {
                    return normalized
                  }
                }
              }
            }
          } catch (e) {
            // 继续
          }
          
          // 方法3: 尝试从所有 link 标签中查找（包括动态添加的）
          try {
            const allLinks = document.querySelectorAll('link')
            for (let link of allLinks) {
              const rel = link.getAttribute('rel')
              if (rel) {
                const relLower = rel.toLowerCase()
                if (relLower.includes('icon') || relLower === 'shortcut icon') {
                  let href = link.href || link.getAttribute('href')
                  if (href) {
                    const normalized = normalizeFaviconUrl(href)
                    if (normalized) {
                      return normalized
                    }
                  }
                }
              }
            }
          } catch (e) {
            // 继续
          }
          
          // 方法4: 默认 favicon.ico（总是返回，让外部验证）
          return window.location.origin + '/favicon.ico'
        } catch (e) {
          // 即使出错，也返回默认 favicon
          try {
            return window.location.origin + '/favicon.ico'
          } catch (e2) {
            return null
          }
        }
      })()
    `
    
    let faviconUrl
    try {
      faviconUrl = await webview.executeJavaScript(script)
    } catch (e) {
      console.warn('⚠️ getFavicon: 执行脚本失败:', e, 'retryCount:', retryCount)
      // 执行失败，延迟重试
      if (retryCount < 4) {
        const timeout = setTimeout(() => {
          activeTimeouts.delete(timeout)
          if (getWebview()) {
            getFavicon(retryCount + 1)
          }
        }, 600 * (retryCount + 1))
        activeTimeouts.add(timeout)
      }
      return null
    }
    
    // 处理返回的 favicon URL
    if (faviconUrl && faviconUrl !== 'null' && faviconUrl !== null && faviconUrl !== '') {
      // 确保 URL 是完整的 HTTP/HTTPS URL
      let finalUrl = faviconUrl
      
      if (!faviconUrl.startsWith('http://') && !faviconUrl.startsWith('https://')) {
        // 如果不是完整 URL，尝试转换
        try {
          const urlObj = new URL(currentUrl)
          if (faviconUrl.startsWith('/')) {
            finalUrl = urlObj.origin + faviconUrl
          } else if (faviconUrl.startsWith('//')) {
            finalUrl = urlObj.protocol + faviconUrl
          } else {
            finalUrl = new URL(faviconUrl, currentUrl).href
          }
        } catch (e) {
          // 转换失败，使用原始值
        }
      }
      
      // 验证最终 URL 是否有效
      if (finalUrl && (finalUrl.startsWith('http://') || finalUrl.startsWith('https://'))) {
        console.log('✅ getFavicon: 成功获取 favicon:', finalUrl, 'retryCount:', retryCount)
        emit('favicon-updated', finalUrl, props.tabId)
        return finalUrl
      }
    }
    
    // 如果获取失败，延迟重试（增加重试次数）
    if (retryCount < 4) {
      const timeout = setTimeout(() => {
        activeTimeouts.delete(timeout)
        if (getWebview()) {
          getFavicon(retryCount + 1)
        }
      }, 1000 * (retryCount + 1)) // 逐步增加延迟
      activeTimeouts.add(timeout)
    } else {
      // 最后一次重试失败，使用默认 favicon.ico
      try {
        const urlObj = new URL(currentUrl)
        const defaultFavicon = urlObj.origin + '/favicon.ico'
        console.log('🔄 getFavicon: 所有重试失败，使用默认 favicon:', defaultFavicon)
        emit('favicon-updated', defaultFavicon, props.tabId)
        return defaultFavicon
      } catch (e) {
        console.warn('❌ getFavicon: 无法生成默认 favicon URL')
      }
    }
  } catch (e) {
    console.warn('❌ 获取 favicon 失败:', e, 'retryCount:', retryCount)
    if (retryCount < 4) {
      const timeout = setTimeout(() => {
        activeTimeouts.delete(timeout)
        if (getWebview()) {
          getFavicon(retryCount + 1)
        }
      }, 1200 * (retryCount + 1))
      activeTimeouts.add(timeout)
    }
  }
  
  return null
}

const isLoginLikeUrl = (url) => {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.includes('login') ||
    lower.includes('signin') ||
    lower.includes('sign_in') ||
    lower.includes('authenticate')
}

const stopPasswordCapturePolling = () => {
  if (passwordCaptureInterval) {
    clearInterval(passwordCaptureInterval)
    passwordCaptureInterval = null
  }
  if (passwordCaptureStopTimeout) {
    clearTimeout(passwordCaptureStopTimeout)
    passwordCaptureStopTimeout = null
  }
}

const startPasswordCapturePolling = () => {
  stopPasswordCapturePolling()
  passwordCaptureInterval = setInterval(async () => {
    if (!props.isActive || showPasswordSaveDialog.value) return
    const webview = getWebview()
    if (!webview) {
      stopPasswordCapturePolling()
      return
    }
    try {
      const result = await webview.executeJavaScript(`
        (function() {
          if (window.__passwordToSave) {
            const data = window.__passwordToSave
            window.__passwordToSave = null
            return data
          }
          return null
        })()
      `)
      if (result && result.username && result.password && result.domain) {
        await handlePasswordSaveRequest(result)
      }
    } catch (err) {
      // 页面跳转过程中的执行失败可以忽略
    }
  }, 1200)

  passwordCaptureStopTimeout = setTimeout(() => {
    stopPasswordCapturePolling()
  }, 45000)
}

// 设置密码保存监听器
const setupPasswordSaveListener = () => {
  const webview = getWebview()
  if (!webview) return
  
  // 检查是否是真正的页面（非 about:blank）
  try {
    const currentUrl = webview.getURL()
    if (!currentUrl || !currentUrl.startsWith('http')) {
      return
    }
  } catch (e) {
    return
  }
  
  // 静默设置，减少日志输出
  
  try {
    const script = `
      (function() {
        if (window.__openGitPasswordListenerInjected) {
          return true
        }
        window.__openGitPasswordListenerInjected = true

        if (window.__passwordSaveSubmitHandler) {
          document.removeEventListener('submit', window.__passwordSaveSubmitHandler, true)
        }
        if (window.__passwordSaveClickHandler) {
          document.removeEventListener('click', window.__passwordSaveClickHandler, true)
        }
        
        function savePasswordData() {
          console.log('🔐 savePasswordData 被调用')
          
          // 首先尝试 Jenkins 特有的字段
          let usernameInput = document.querySelector('input[name="j_username"]')
          let passwordInput = document.querySelector('input[name="j_password"]')
          
          // 如果找到了 Jenkins 字段
          if (usernameInput && passwordInput) {
            console.log('🔐 找到 Jenkins 登录字段')
            if (usernameInput.value && passwordInput.value) {
              window.__passwordToSave = {
                username: usernameInput.value.trim(),
                password: passwordInput.value,
                domain: window.location.hostname
              }
              console.log('🔐 Jenkins: 检测到密码输入，用户名:', usernameInput.value)
              return true
            }
          }
          
          // 通用选择器
          const usernameSelectors = [
            'input[name="username"]',
            'input[type="text"]',
            'input[type="email"]',
            'input[name*="user" i]',
            'input[name*="login" i]',
            'input[name*="account" i]',
            'input[id*="user" i]',
            'input[id*="login" i]',
            'input[id*="account" i]',
            'input[placeholder*="user" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="账号" i]',
            'input[placeholder*="用户名" i]'
          ].join(', ');
          
          const usernameInputs = document.querySelectorAll(usernameSelectors);
          const passwordInputs = document.querySelectorAll('input[type="password"]');
          
          console.log('🔐 找到用户名输入框数量:', usernameInputs.length, '密码输入框数量:', passwordInputs.length)
          
          usernameInput = null;
          passwordInput = null;
          
          for (let input of usernameInputs) {
            if (input.offsetParent !== null) {
              const value = input.value ? input.value.trim() : ''
              console.log('🔐 检查用户名输入框:', input.name || input.id, '值:', value ? '有值' : '空')
              if (value) {
                usernameInput = input
                break
              }
            }
          }
          
          for (let input of passwordInputs) {
            if (input.offsetParent !== null) {
              const value = input.value || ''
              console.log('🔐 检查密码输入框:', input.name || input.id, '值:', value ? '有值' : '空')
              if (value) {
                passwordInput = input
                break
              }
            }
          }
          
          if (usernameInput && passwordInput && usernameInput.value && passwordInput.value) {
            // 防止重复保存同一组密码
            const newData = {
              username: usernameInput.value.trim(),
              password: passwordInput.value,
              domain: window.location.hostname
            }
            
            // 检查是否已经保存过相同的数据
            if (window.__passwordToSave && 
                window.__passwordToSave.username === newData.username &&
                window.__passwordToSave.password === newData.password &&
                window.__passwordToSave.domain === newData.domain) {
              console.log('🔐 savePasswordData: 密码数据未变化，跳过')
              return false
            }
            
            window.__passwordToSave = newData
            console.log('🔐 savePasswordData: 检测到密码输入，用户名:', usernameInput.value.trim())
            return true
          }
          return false
        }
        
        window.__passwordSaveSubmitHandler = function(e) {
          console.log('🔐 表单提交事件触发')
          const form = e.target
          if (form && form.tagName === 'FORM') {
            console.log('🔐 检测到表单提交，尝试保存密码')
            const saved = savePasswordData()
            if (saved) {
              console.log('🔐 表单提交时成功保存密码数据')
            } else {
              console.log('🔐 表单提交时未检测到密码，延迟重试')
              setTimeout(() => {
                const retrySaved = savePasswordData()
                if (retrySaved) {
                  console.log('🔐 延迟重试后成功保存密码数据')
                }
              }, 100)
            }
          }
        }
        
        window.__passwordSaveClickHandler = function(e) {
          const button = e.target
          const buttonText = button ? (button.textContent || button.value || button.innerText || '').toLowerCase() : ''
          
          const isSubmitButton = button && (
            button.type === 'submit' ||
            button.getAttribute('type') === 'submit' ||
            button.tagName === 'INPUT' && button.type === 'submit' ||  // Jenkins 使用 input[type=submit]
            button.tagName === 'BUTTON' && (
              buttonText.includes('login') ||
              buttonText.includes('log in') ||  // Jenkins
              buttonText.includes('sign in') ||
              buttonText.includes('signin') ||
              buttonText.includes('登录') ||
              buttonText.includes('登入') ||
              buttonText.includes('submit') ||
              buttonText.includes('提交')
            ) ||
            buttonText.includes('log in') ||  // Jenkins input[type=submit]
            buttonText.includes('login') ||
            button.classList && (
              Array.from(button.classList).some(cls => 
                cls.toLowerCase().includes('login') || 
                cls.toLowerCase().includes('submit') ||
                cls.toLowerCase().includes('signin')
              )
            )
          )
          
          if (isSubmitButton) {
            console.log('🔐 检测到登录按钮点击，尝试保存密码')
            const saved = savePasswordData()
            if (saved) {
              console.log('🔐 按钮点击时成功保存密码数据')
            } else {
              console.log('🔐 按钮点击时未检测到密码，延迟重试')
              setTimeout(() => {
                const retrySaved = savePasswordData()
                if (retrySaved) {
                  console.log('🔐 延迟重试后成功保存密码数据')
                }
              }, 50)
              setTimeout(() => {
                savePasswordData()
              }, 200)
              setTimeout(() => {
                savePasswordData()
              }, 500)
            }
          }
        }
        
        // 使用捕获阶段，确保能捕获到所有事件
        document.addEventListener('submit', window.__passwordSaveSubmitHandler, true)
        document.addEventListener('click', window.__passwordSaveClickHandler, true)
        
        // 监听 keydown 事件（回车提交表单）
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            console.log('🔐 回车键提交，尝试保存密码')
            savePasswordData()
          }
        }, true)
        
        // 监听页面离开事件（在页面跳转前保存密码）
        window.addEventListener('beforeunload', function(e) {
          console.log('🔐 页面即将离开，尝试保存密码')
          savePasswordData()
        })
        
        // 监听表单的 submit 按钮点击（更精确）
        document.querySelectorAll('input[type="submit"], button[type="submit"]').forEach(btn => {
          btn.addEventListener('click', function(e) {
            console.log('🔐 提交按钮被点击')
            savePasswordData()
          }, true)
        })
        
        console.log('🔐 密码保存监听器已设置完成')
      })()
    `
    
    const injectScript = () => {
      const currentWebview = getWebview()
      if (currentWebview) {
        currentWebview.executeJavaScript(script).catch(() => {
          // 1秒后重试注入脚本
          const timeout = setTimeout(injectScript, 1000)
          activeTimeouts.add(timeout)
        })
      } else {
        const timeout = setTimeout(injectScript, 500)
        activeTimeouts.add(timeout)
      }
    }
    
    const timeout = setTimeout(injectScript, 1000)
    activeTimeouts.add(timeout)
  } catch (error) {
    console.error('❌ 设置密码保存监听器失败:', error)
  }
}

// 检查并填充密码（静默执行，减少日志）
const checkAndFillPassword = async () => {
  const webview = getWebview()
  if (!webview) return
  
  if (!savedPasswords.value || savedPasswords.value.length === 0) return
  
  try {
    // 使用 getURL() 方法获取当前 URL（更可靠）
    let currentUrl
    try {
      currentUrl = await webview.getURL()
    } catch (e) {
      try {
        currentUrl = webview.src
      } catch (e2) {
        return
      }
    }
    
    if (!currentUrl || !currentUrl.startsWith('http')) return
    
    const urlObj = new URL(currentUrl)
    const domain = urlObj.hostname
    
    // 查找匹配的密码
    const matchingPasswords = savedPasswords.value.filter(pwd => {
      try {
        const pwdDomain = new URL(pwd.domain).hostname
        return pwdDomain === domain || pwdDomain.replace(/^www\./, '') === domain.replace(/^www\./, '')
      } catch (e) {
        return pwd.domain === domain
      }
    })
    
    if (matchingPasswords.length === 0) return
    
    // 如果有多个密码，使用第一个
    const passwordToFill = matchingPasswords[0]
    console.log('🔐 自动填充密码:', passwordToFill.username, '@', domain)
    
    const fillScript = `
      (function() {
        const username = ${JSON.stringify(passwordToFill.username)};
        const password = ${JSON.stringify(passwordToFill.password)};
        
        const usernameSelectors = [
          'input[type="text"]',
          'input[type="email"]',
          'input[name*="user" i]',
          'input[name*="login" i]',
          'input[name*="account" i]',
          'input[id*="user" i]',
          'input[id*="login" i]',
          'input[id*="account" i]'
        ].join(', ');
        
        const usernameInputs = document.querySelectorAll(usernameSelectors);
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        
        let usernameInput = null;
        let passwordInput = null;
        
        for (let input of usernameInputs) {
          if (input.offsetParent !== null && !input.value) {
            usernameInput = input
            break
          }
        }
        
        for (let input of passwordInputs) {
          if (input.offsetParent !== null && !input.value) {
            passwordInput = input
            break
          }
        }
        
        if (usernameInput && passwordInput) {
          // 模拟真实键盘输入的函数
          function simulateTyping(input, text, callback) {
            input.focus();
            input.value = '';
            
            // 先触发 focus 事件
            input.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
            
            // 一次性设置值
            input.value = text;
            
            // 触发所有可能需要的键盘事件
            const keydownEvent = new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true
            });
            const keypressEvent = new KeyboardEvent('keypress', {
              bubbles: true,
              cancelable: true
            });
            const keyupEvent = new KeyboardEvent('keyup', {
              bubbles: true,
              cancelable: true
            });
            
            input.dispatchEvent(keydownEvent);
            input.dispatchEvent(keypressEvent);
            
            // 触发 input 事件（使用 InputEvent，这是最关键的）
            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: text
            });
            input.dispatchEvent(inputEvent);
            
            // 触发 beforeinput 事件（某些网站需要）
            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: text
            });
            input.dispatchEvent(beforeInputEvent);
            
            input.dispatchEvent(keyupEvent);
            
            // 触发 change 事件
            input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            
            // 触发 composition 相关事件（某些网站需要）
            input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            input.dispatchEvent(new Event('compositionupdate', { bubbles: true }));
            input.dispatchEvent(new Event('compositionend', { bubbles: true }));
            
            if (callback) callback();
          }
          
          // 先填充用户名
          simulateTyping(usernameInput, username, () => {
            console.log('✅ 已填充用户名:', username);
            
            // 用户名填充完成后，填充密码
            setTimeout(() => {
              simulateTyping(passwordInput, password, () => {
                console.log('✅ 已填充密码，长度:', password.length);
              });
            }, 100);
          });
          
          return true
        }
        return false
      })()
    `
    
    const filled = await webview.executeJavaScript(fillScript)
    
    if (filled) {
      filledPassword.value = {
        username: passwordToFill.username,
        password: passwordToFill.password,
        domain: domain
      }
      emit('password-filled', { username: passwordToFill.username, domain }, props.tabId)
    }
  } catch (error) {
    // 静默失败
  }
}

// 事件处理函数
const onLoadStart = (event) => {
  emit('did-start-loading', event, props.tabId)
  updateNavigationState()
  
  // 页面开始加载时，重置 favicon 标记
  hasFavicon = false
}

const onLoadStop = (event) => {
  emit('did-stop-loading', event, props.tabId)
  updateNavigationState()
  
  // 备用方案：如果 page-favicon-updated 事件没有触发，延迟尝试获取 favicon
  // 使用较长延迟，让内置事件有时间触发
  const timeout = setTimeout(() => {
    activeTimeouts.delete(timeout)
    // 只在内置事件没有获取到 favicon 时才使用备用方案
    if (!hasFavicon) {
      console.log('🔄 备用方案：尝试获取 favicon, tabId:', props.tabId)
      getFavicon()
    }
  }, 2000)
  activeTimeouts.add(timeout)
  
  // 只在真正的页面（非 about:blank）加载完成后设置密码功能
    const webview = getWebview()
    if (webview) {
    try {
      const currentUrl = webview.getURL()
      if (currentUrl && currentUrl.startsWith('http')) {
        // 更新 lastPageUrl
        lastPageUrl = currentUrl

        setupPasswordSaveListener()
        checkAndFillPassword()
        if (props.isActive && isLoginLikeUrl(currentUrl)) {
          startPasswordCapturePolling()
        } else {
          stopPasswordCapturePolling()
        }
      } else {
        stopPasswordCapturePolling()
      }
    } catch (e) {
      // 静默失败
    }
  }
}

// 在导航发生前检查密码（will-navigate 事件）- 自动保存，不需要用户确认
const onWillNavigate = async (event) => {
  console.log('🔐 will-navigate: 页面即将导航到:', event.url)
  stopPasswordCapturePolling()
  
  // 检查是否从登录页面跳转（URL 变化）
    const webview = getWebview()
  if (!webview) return
  
  try {
    const currentUrl = webview.getURL()
    // 如果当前是登录页面（包含 login、signin 等关键词），尝试保存密码
    if (currentUrl && (
      currentUrl.toLowerCase().includes('login') ||
      currentUrl.toLowerCase().includes('signin') ||
      currentUrl.toLowerCase().includes('sign_in') ||
      currentUrl.toLowerCase().includes('authenticate')
    )) {
      console.log('🔐 检测到从登录页面跳转，尝试获取密码')
      
      // 在页面跳转前执行脚本获取密码
      const result = await webview.executeJavaScript(`
        (function() {
          // Jenkins 特有字段
          let usernameInput = document.querySelector('input[name="j_username"]')
          let passwordInput = document.querySelector('input[name="j_password"]')
          
          if (!usernameInput || !passwordInput) {
            // 通用选择器
            const usernameSelectors = 'input[name="username"], input[type="text"], input[type="email"], input[name*="user" i], input[id*="user" i]'
            const allUsernameInputs = document.querySelectorAll(usernameSelectors)
            const allPasswordInputs = document.querySelectorAll('input[type="password"]')
            
            for (let input of allUsernameInputs) {
              if (input.offsetParent !== null && input.value) {
                usernameInput = input
                break
              }
            }
            
            for (let input of allPasswordInputs) {
              if (input.offsetParent !== null && input.value) {
                passwordInput = input
                break
              }
            }
          }
          
          if (usernameInput && passwordInput && usernameInput.value && passwordInput.value) {
            return {
              username: usernameInput.value.trim(),
              password: passwordInput.value,
              domain: window.location.hostname
            }
          }
          return null
        })()
      `)
      
      if (result && result.username && result.password && result.domain) {
        console.log('🔐 will-navigate: 检测到密码，用户名:', result.username, '域名:', result.domain)
        
        // 检查是否和之前填充的相同（避免重复保存自动填充的密码）
        if (filledPassword.value && 
            filledPassword.value.username === result.username &&
            filledPassword.value.password === result.password &&
            filledPassword.value.domain === result.domain) {
          console.log('🔐 密码与已填充的相同，跳过自动保存')
          return
        }
        
        // 检查是否已存在相同的密码
        const existing = findPassword(result.domain, result.username)
        if (existing && existing.password === result.password) {
          console.log('🔐 密码已存在且相同，跳过保存')
          return
        }
        
        // 自动保存密码（不弹出确认框）
        console.log('🔐 自动保存密码:', result.username, '@', result.domain)
        try {
          const saveResult = await savePassword(result.username, result.password, result.domain)
          if (saveResult.success) {
            console.log('✅ 密码已自动保存')
    } else {
            console.log('⚠️ 密码保存失败:', saveResult.message)
          }
        } catch (saveErr) {
          console.error('❌ 保存密码异常:', saveErr)
    }
      }
    }
  } catch (e) {
    console.log('🔐 will-navigate 检查密码失败:', e.message)
}
}

// 记录上一个页面的 URL 和密码数据（用于页面跳转时自动保存）
let lastPageUrl = ''

const onNavigate = async (event) => {
  emit('did-navigate', event, props.tabId)
  updateNavigationState()
  
  // 更新上一个页面 URL
  lastPageUrl = event.url
  
  // 清除之前填充的密码信息（页面导航后需要重新填充）
  filledPassword.value = null
}

const onNavigateInPage = (event) => {
  emit('did-navigate-in-page', event, props.tabId)
  updateNavigationState()
}

const onTitleUpdated = async (event) => {
  emit('page-title-updated', event, props.tabId)
  emit('title-updated', event.title, props.tabId)
}

// 使用 webview 内置的 page-favicon-updated 事件
const onFaviconUpdated = (event) => {
  // event.favicons 是一个包含所有 favicon URL 的数组
  if (event.favicons && event.favicons.length > 0) {
    // 优先选择较大的图标（通常排在后面）
    const favicon = event.favicons[event.favicons.length - 1]
    console.log('🖼️ page-favicon-updated:', favicon, 'tabId:', props.tabId)
    hasFavicon = true // 标记已获取到 favicon
    emit('favicon-updated', favicon, props.tabId)
  }
}

const onNewWindow = (event) => {
  console.log('🔗 WebView new-window 事件:', event.url, 'disposition:', event.disposition)
  // 阻止默认行为（防止在系统浏览器中打开）
  if (event.preventDefault) {
    event.preventDefault()
  }
  emit('new-window', event, props.tabId)
}

const onDomReady = (event) => {
  // 尝试从多个来源获取 webview 实例
  let webview = getWebview()
  
  // 如果 webviewRef.value 是 null，尝试从其他来源获取
  if (!webview) {
    if (event && event.target) {
      webview = event.target
    } else {
      const webviewElement = document.querySelector(`webview[data-tab-id="${props.tabId}"]`)
      if (webviewElement) {
        webview = webviewElement
      }
    }
    
    // 如果还是 null，延迟重试一次
    if (!webview) {
      setTimeout(() => {
        const wv = getWebview()
        if (wv) {
          handleDomReady(wv, event)
        } else {
          emit('dom-ready', event, props.tabId)
          emit('webview-ready', null, props.tabId)
        }
      }, 100)
      return
    }
  }
  
  handleDomReady(webview, event)
}

const handleDomReady = (webview, event) => {
  if (webview) {
    // 注意：不在 dom-ready 后设置 user agent，因为这可能导致页面刷新
    // user agent 应该在 webview 创建时通过属性设置，或者在导航前设置
    // try {
    //   webview.setUserAgent(props.userAgent)
    // } catch (e) {
    //   // 静默失败
    // }
    
    // 标记 webview 已准备好
    isWebviewReady.value = true
    
    // 确保 webviewRef.value 也被设置
    if (!webviewRef.value) {
      webviewRef.value = webview
    }
    
    // 更新导航状态
    updateNavigationState()
    
    // 不再主动调用 getFavicon，使用内置的 page-favicon-updated 事件
    
    // 监听 webview 的右键菜单事件
    webview.addEventListener('context-menu', (e) => {
      // 显示自定义右键菜单
      showContextMenu(e)
    })
  }
  
  // 总是 emit 事件
  emit('dom-ready', event, props.tabId)
  emit('webview-ready', webview, props.tabId)
}

const onLoadFail = (event) => {
  emit('did-fail-load', event, props.tabId)
}

// 在组件挂载时，确保 ref 被正确设置
onMounted(() => {
  setTimeout(() => {
    if (!webviewRef.value) {
      const webviewElement = document.querySelector(`webview[data-tab-id="${props.tabId}"]`)
      if (webviewElement) {
        webviewRef.value = webviewElement
      }
    }
    
    // 确保初始 src 被设置（因为移除了模板中的 :src 绑定）
    const webview = getWebview()
    if (webview && props.src && props.src !== '' && props.src !== 'about:blank') {
      // 只有当 src 与当前 webview.src 不同时才设置
      try {
        const currentSrc = webview.src || ''
        if (currentSrc !== props.src && lastSetSrc.value !== props.src) {
          lastSetSrc.value = props.src
          webview.src = props.src
        }
      } catch (e) {
        // 静默失败
      }
    }
  }, 50)
})

// 清理
onUnmounted(() => {
  // 标记组件已卸载
  isUnmounted = true
  
  stopPasswordCapturePolling()
  
  // 清理所有活动的 setTimeout
  activeTimeouts.forEach(timeout => {
    clearTimeout(timeout)
  })
  activeTimeouts.clear()
})

// 注意：移除 defineExpose，避免生产构建中的 refs 访问问题
// 父组件通过 onWebviewReady 事件获取 webview 实例，直接操作 webview

// 处理密码保存请求
const handlePasswordSaveRequest = async (data) => {
  try {
    console.log('🔐 handlePasswordSaveRequest 被调用，数据:', data)
    const { username, password, domain } = data
    
    if (!username || !password || !domain) {
      console.warn('⚠️ 密码保存请求数据不完整:', data)
      return
    }
    
    // 如果之前有自动填充，且账号或密码发生了变化，则提示更新
    if (filledPassword.value && filledPassword.value.domain === domain) {
      const usernameChanged = filledPassword.value.username !== username
      const passwordChanged = filledPassword.value.password !== password
      
      if (usernameChanged || passwordChanged) {
        console.log('🔐 检测到账号或密码变化，提示更新:', { 
          usernameChanged, 
          passwordChanged,
          oldUsername: filledPassword.value.username,
          newUsername: username
        })
    
        // 检查是否已存在相同域名和用户名的密码
        const existing = findPassword(domain, username)
        
        // 显示更新确认对话框
        passwordSaveData.value = {
          username,
          password,
          domain,
          isUpdate: true // 标记为更新
        }
        showPasswordSaveDialog.value = true
        
        console.log('✅ 密码更新对话框已显示，showPasswordSaveDialog:', showPasswordSaveDialog.value, 'passwordSaveData:', passwordSaveData.value)
        
        // 确保弹框显示（使用 nextTick 确保 DOM 更新）
        await nextTick()
        console.log('✅ 密码更新对话框 DOM 已更新，visible:', showPasswordSaveDialog.value)
        return
      }
    }
    
    // 检查是否已存在相同域名和用户名的密码
    const existing = findPassword(domain, username)
    
    // 如果已存在且密码相同，不提示保存
    if (existing && existing.password === password) {
      console.log('🔐 密码已存在且相同，不提示保存')
      return
    }
    
    console.log('🔐 准备显示密码保存对话框:', { username, domain, isUpdate: !!existing })
    
    // 显示确认对话框
    passwordSaveData.value = {
      username,
      password,
      domain,
      isUpdate: !!existing
    }
    showPasswordSaveDialog.value = true
    
    console.log('✅ 密码保存对话框已显示，showPasswordSaveDialog:', showPasswordSaveDialog.value, 'passwordSaveData:', passwordSaveData.value)
    
    // 确保弹框显示（使用 nextTick 确保 DOM 更新）
    await nextTick()
    console.log('✅ 密码保存对话框 DOM 已更新，visible:', showPasswordSaveDialog.value)
  } catch (error) {
    console.error('❌ 保存密码失败:', error)
  }
}

// 确认保存密码
const handleConfirmSavePassword = async (data) => {
  const { username, password, domain, isUpdate, id } = data
  if (isUpdate && id) {
    await updatePassword(id, username, password, domain)
  } else {
    await savePassword(username, password, domain)
  }
  showPasswordSaveDialog.value = false
  passwordSaveData.value = { username: '', password: '', domain: '', isUpdate: false }
}

// 取消保存密码
const cancelSavePassword = () => {
  showPasswordSaveDialog.value = false
  passwordSaveData.value = { username: '', password: '', domain: '', isUpdate: false }
}
</script>

<style scoped>
/* webview 样式现在通过内联样式控制 */
</style>

<style>
/* 右键菜单样式（全局，因为使用了 Teleport） */
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99998;
  background: transparent;
  -webkit-app-region: no-drag; /* 禁用窗口拖拽，确保点击事件能被捕获 */
}

.webview-context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  padding: 4px 0;
  min-width: 160px;
  z-index: 99999;
}

.context-menu-item {
  padding: 8px 16px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}
</style>
