const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { URL } = require('url')

const WALLPAPER_CONFIG_KEY = 'homePageBackground'
const BING_PROVIDER_ID = 'bing'
const DEFAULT_BING_MARKET = 'zh-CN'
const BING_API_URL = 'https://www.bing.com/HPImageArchive.aspx'

function createDefaultOnlineSettings(overrides = {}) {
  return {
    providerId: BING_PROVIDER_ID,
    itemId: '',
    title: '',
    previewUrl: '',
    remoteUrl: '',
    cachedFilePath: '',
    cachedDataUrl: '',
    autoUpdateLatest: false,
    lastAutoUpdateDate: '',
    market: DEFAULT_BING_MARKET,
    ...overrides
  }
}

function normalizeBackgroundConfig(raw = {}) {
  const online = createDefaultOnlineSettings(raw?.online || {})
  return {
    mode: raw?.mode === 'online' ? 'online' : 'local',
    image: typeof raw?.image === 'string' ? raw.image : '',
    overlayOpacity: Number.isFinite(Number(raw?.overlayOpacity)) ? Number(raw.overlayOpacity) : 30,
    blurAmount: Number.isFinite(Number(raw?.blurAmount)) ? Number(raw.blurAmount) : 5,
    localImagePath: typeof raw?.localImagePath === 'string' ? raw.localImagePath : '',
    online
  }
}

function getTodayDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sanitizeFileName(value = '') {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'wallpaper'
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function toDataUrl(filePath, contentType = '') {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  }
  const mimeType = contentType || mimeTypes[ext] || 'image/jpeg'
  const fileBuffer = fs.readFileSync(filePath)
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`
}

function requestBuffer(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'OpenGit/1.0'
      },
      timeout: 30000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString()
        resolve(requestBuffer(redirectUrl))
        return
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`下载失败: ${res.statusCode || 0}`))
        return
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: String(res.headers['content-type'] || '').split(';')[0].trim()
        })
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error(`请求超时: ${url}`))
    })
    req.on('error', reject)
    req.end()
  })
}

async function writeDownloadedWallpaper(candidateUrls, targetFilePath) {
  let lastError = null
  for (const candidate of candidateUrls) {
    try {
      const response = await requestBuffer(candidate)
      fs.writeFileSync(targetFilePath, response.buffer)
      return {
        filePath: targetFilePath,
        contentType: response.contentType || '',
        sourceUrl: candidate
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('下载壁纸失败')
}

function parseBingTitle(value = '') {
  const text = String(value || '').trim()
  if (!text) return 'Bing 每日壁纸'
  const separatorIndex = text.indexOf('(')
  if (separatorIndex > 0) {
    return text.slice(0, separatorIndex).trim()
  }
  return text
}

function normalizeBingItems(images = [], market = DEFAULT_BING_MARKET, startIndex = 0) {
  return images.map((item, index) => {
    const startDate = String(item.startdate || '').trim()
    const urlBase = String(item.urlbase || '').trim()
    const fallbackUrl = String(item.url || '').trim()
    const previewUrl = fallbackUrl ? `https://www.bing.com${fallbackUrl}` : `https://www.bing.com${urlBase}_1920x1080.jpg`
    const remoteUrl = urlBase ? `https://www.bing.com${urlBase}_UHD.jpg` : previewUrl
    return {
      id: `${startDate || 'unknown'}-${market}-${urlBase || fallbackUrl || index}`,
      title: parseBingTitle(item.title || item.copyright || ''),
      subtitle: String(item.copyright || '').trim(),
      date: startDate ? `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(6, 8)}` : '',
      previewUrl,
      downloadUrl: remoteUrl,
      fallbackDownloadUrl: previewUrl,
      attribution: 'Bing',
      market
    }
  })
}

async function getBingWallpaperList({ fetch, market = DEFAULT_BING_MARKET, offset = 0, limit = 8 }) {
  const normalizedOffset = Math.max(Number(offset) || 0, 0)
  const targetLimit = Math.max(Number(limit) || 8, 1)
  const items = []
  const seen = new Set()
  let currentOffset = normalizedOffset

  while (items.length < targetLimit && currentOffset < normalizedOffset + targetLimit) {
    const batchSize = Math.min(8, targetLimit - items.length)
    const url = `${BING_API_URL}?format=js&idx=${currentOffset}&n=${batchSize}&mkt=${encodeURIComponent(market)}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OpenGit/1.0'
      },
      timeout: 30000
    })

    if (!response.ok) {
      throw new Error(`获取 Bing 壁纸失败: ${response.status} ${response.statusText}`)
    }

    const payload = await response.json()
    const images = Array.isArray(payload?.images) ? payload.images : []
    const normalized = normalizeBingItems(images, market, currentOffset)
    let appended = 0
    for (const item of normalized) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
      appended += 1
      if (items.length >= targetLimit) break
    }
    if (!images.length || appended === 0) break
    currentOffset += 8
  }

  return {
    items,
    hasMore: false
  }
}

function getWallpaperCacheRoot(app) {
  return path.join(app.getPath('userData'), 'wallpapers')
}

function getProviderCacheDir(app, providerId) {
  return path.join(getWallpaperCacheRoot(app), providerId)
}

async function downloadWallpaperToCache({ app, providerId, item, safeError }) {
  if (!item?.downloadUrl && !item?.fallbackDownloadUrl) {
    throw new Error('缺少壁纸下载地址')
  }

  const providerDir = getProviderCacheDir(app, providerId)
  ensureDirectory(providerDir)

  const datePrefix = item.date || getTodayDateString()
  const fileName = sanitizeFileName(`${datePrefix}-${item.title || item.id}`) + '.jpg'
  const targetFilePath = path.join(providerDir, fileName)

  const downloadResult = await writeDownloadedWallpaper(
    [item.downloadUrl, item.fallbackDownloadUrl].filter(Boolean),
    targetFilePath
  )

  let cachedDataUrl = ''
  try {
    cachedDataUrl = toDataUrl(downloadResult.filePath, downloadResult.contentType)
  } catch (error) {
    safeError?.('❌ 转换壁纸为 dataUrl 失败:', error.message)
  }

  return {
    cachedFilePath: downloadResult.filePath,
    cachedDataUrl,
    remoteUrl: downloadResult.sourceUrl
  }
}

async function refreshOnlineWallpaperConfigIfNeeded({
  app,
  fetch,
  config,
  force = false,
  safeLog,
  safeError
}) {
  const normalized = normalizeBackgroundConfig(config || {})
  if (normalized.mode !== 'online') {
    return { success: true, updated: false, config: normalized, reason: 'not-online-mode' }
  }

  const online = normalized.online || createDefaultOnlineSettings()
  if (online.providerId !== BING_PROVIDER_ID) {
    return { success: false, updated: false, config: normalized, error: '暂不支持该在线壁纸源' }
  }

  const today = getTodayDateString()
  if (!force && (!online.autoUpdateLatest || online.lastAutoUpdateDate === today)) {
    return { success: true, updated: false, config: normalized, reason: 'already-updated-or-disabled' }
  }

  try {
    const latestList = await getBingWallpaperList({
      fetch,
      market: online.market || DEFAULT_BING_MARKET,
      offset: 0,
      limit: 1
    })
    const latestItem = latestList.items[0]
    if (!latestItem) {
      return { success: false, updated: false, config: normalized, error: '未获取到最新在线壁纸' }
    }

    const currentCacheExists = online.cachedFilePath && fs.existsSync(online.cachedFilePath)
    if (!force && latestItem.id === online.itemId && currentCacheExists) {
      return {
        success: true,
        updated: false,
        config: {
          ...normalized,
          online: {
            ...online,
            lastAutoUpdateDate: today
          }
        },
        reason: 'already-latest'
      }
    }

    const downloadResult = await downloadWallpaperToCache({
      app,
      providerId: BING_PROVIDER_ID,
      item: latestItem,
      safeError
    })

    const nextConfig = {
      ...normalized,
      mode: 'online',
      image: downloadResult.cachedDataUrl || normalized.image,
      online: {
        ...online,
        providerId: BING_PROVIDER_ID,
        itemId: latestItem.id,
        title: latestItem.title,
        previewUrl: latestItem.previewUrl,
        remoteUrl: downloadResult.remoteUrl || latestItem.downloadUrl,
        cachedFilePath: downloadResult.cachedFilePath,
        cachedDataUrl: downloadResult.cachedDataUrl,
        autoUpdateLatest: online.autoUpdateLatest === true,
        lastAutoUpdateDate: today,
        market: latestItem.market || online.market || DEFAULT_BING_MARKET
      }
    }

    return {
      success: true,
      updated: true,
      config: nextConfig,
      item: latestItem
    }
  } catch (error) {
    safeError?.('❌ 自动更新在线壁纸失败:', error.message)
    return {
      success: false,
      updated: false,
      config: normalized,
      error: error.message
    }
  }
}

function registerWallpaperHandlers({
  ipcMain,
  app,
  fetch,
  safeLog,
  safeError
}) {
  ipcMain.handle('list-online-wallpaper-providers', async () => {
    return {
      success: true,
      providers: [
        {
          id: BING_PROVIDER_ID,
          label: 'Bing 每日壁纸',
          supportsAutoUpdate: true,
          defaultOptions: {
            market: DEFAULT_BING_MARKET
          }
        }
      ]
    }
  })

  ipcMain.handle('get-online-wallpaper-list', async (event, { providerId = BING_PROVIDER_ID, options = {} } = {}) => {
    try {
      if (providerId !== BING_PROVIDER_ID) {
        return { success: false, error: '暂不支持该在线壁纸源', items: [] }
      }
      const result = await getBingWallpaperList({
        fetch,
        market: options?.market || DEFAULT_BING_MARKET,
        offset: options?.offset || 0,
        limit: options?.limit || 8
      })
      return { success: true, items: result.items, hasMore: result.hasMore }
    } catch (error) {
      safeError('❌ 获取在线壁纸列表失败:', error.message)
      return { success: false, error: error.message, items: [] }
    }
  })

  ipcMain.handle('download-online-wallpaper', async (event, { providerId = BING_PROVIDER_ID, item } = {}) => {
    try {
      const downloadResult = await downloadWallpaperToCache({
        app,
        providerId,
        item,
        safeError
      })
      return {
        success: true,
        ...downloadResult
      }
    } catch (error) {
      safeError('❌ 下载在线壁纸失败:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('refresh-online-wallpaper-if-needed', async (event, { config, force = false } = {}) => {
    return refreshOnlineWallpaperConfigIfNeeded({
      app,
      fetch,
      config,
      force,
      safeLog,
      safeError
    })
  })
}

async function autoRefreshOnlineWallpaperOnStartup({
  app,
  store,
  fetch,
  safeLog,
  safeError
}) {
  try {
    const current = store.get(WALLPAPER_CONFIG_KEY, null)
    if (!current) return
    const result = await refreshOnlineWallpaperConfigIfNeeded({
      app,
      fetch,
      config: current,
      force: false,
      safeLog,
      safeError
    })
    if (result?.success && result?.config && result.updated) {
      store.set(WALLPAPER_CONFIG_KEY, result.config)
      safeLog('🖼️ 启动时已自动更新在线壁纸')
    } else if (result?.success && result?.config && result.reason === 'already-latest') {
      store.set(WALLPAPER_CONFIG_KEY, result.config)
    }
  } catch (error) {
    safeError('❌ 启动时自动更新在线壁纸失败:', error.message)
  }
}

module.exports = {
  registerWallpaperHandlers,
  autoRefreshOnlineWallpaperOnStartup
}
