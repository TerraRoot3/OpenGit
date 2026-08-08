#!/usr/bin/env node
'use strict'

const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { randomBytes } = require('crypto')
const { spawnSync } = require('child_process')

const APP_NAME = 'CodexBar'
const STORE_FILE_NAME = 'store.json'
const CONFIG_KEY = 'codex-main-session-config-v1'
const MIGRATION_KEYS = [
  CONFIG_KEY,
  'codex-main-sessions-v2',
  'codex-main-active-session-id-v2',
  'codex-main-session-worker-history-v1',
  'codex-proactive-notifications-state-v1'
]
const KEYCHAIN_SERVICE = 'com.terraroot3.codexbar.feishu'
const MAX_BODY_BYTES = 1024 * 1024
const MAX_LOG_ENTRIES = 500

function resolveOpenGitRoot() {
  const candidates = [
    process.env.CODEXBAR_OPEN_GIT_ROOT,
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', 'OpenGitRuntime'),
    process.cwd()
  ].filter(Boolean)
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (
      fs.existsSync(path.join(resolved, 'electron', 'ipc', 'codex-main-session.js'))
      && fs.existsSync(path.join(resolved, 'package.json'))
    ) {
      return resolved
    }
  }
  throw new Error('找不到 OpenGit Codex 运行模块，请设置 CODEXBAR_OPEN_GIT_ROOT')
}

function appSupportDirectory() {
  return process.env.CODEXBAR_DATA_DIR
    ? path.resolve(process.env.CODEXBAR_DATA_DIR)
    : path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function redact(value) {
  return String(value ?? '')
    .replace(/\b(app[_ -]?secret|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*\S+/gi, '$1=[已隐藏]')
    .replace(/\bcli_[A-Za-z0-9_-]{12,}\b/g, '[已隐藏凭据]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[已隐藏凭据]')
}

class RuntimeLogger {
  constructor() {
    this.entries = []
  }

  append(level, args) {
    const message = redact(args.map((item) => {
      if (item instanceof Error) return item.message
      if (typeof item === 'string') return item
      try {
        return JSON.stringify(item)
      } catch (error) {
        return String(item)
      }
    }).join(' '))
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message
    })
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_LOG_ENTRIES)
    }
    process.stderr.write(`[${level}] ${message}\n`)
  }

  info(...args) {
    this.append('info', args)
  }

  error(...args) {
    this.append('error', args)
  }

  list() {
    return this.entries.slice()
  }
}

class Keychain {
  constructor(logger) {
    this.logger = logger
  }

  read(account) {
    const result = spawnSync('/usr/bin/security', [
      'find-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-a', account,
      '-w'
    ], { encoding: 'utf8' })
    return result.status === 0 ? String(result.stdout || '').trim() : ''
  }

  write(account, secret) {
    if (!secret) return true
    const result = spawnSync('/usr/bin/security', [
      'add-generic-password',
      '-U',
      '-s', KEYCHAIN_SERVICE,
      '-a', account,
      '-w', secret
    ], { encoding: 'utf8' })
    if (result.status !== 0) {
      this.logger.error('飞书 Secret 写入 Keychain 失败:', result.stderr || `exit ${result.status}`)
      return false
    }
    return true
  }

  delete(account) {
    spawnSync('/usr/bin/security', [
      'delete-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-a', account
    ], { encoding: 'utf8' })
  }
}

class JsonStore {
  constructor({ directory, logger }) {
    this.directory = directory
    this.filePath = path.join(directory, STORE_FILE_NAME)
    this.logger = logger
    this.keychain = new Keychain(logger)
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    fs.chmodSync(directory, 0o700)
    this.data = this.loadOrMigrate()
  }

  loadJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      return null
    }
  }

  loadOrMigrate() {
    const existing = this.loadJson(this.filePath)
    if (existing && typeof existing === 'object') return existing

    const openGitConfigPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'open-git',
      'config.json'
    )
    const source = this.loadJson(openGitConfigPath)
    const migrated = {}
    if (source && typeof source === 'object') {
      for (const key of MIGRATION_KEYS) {
        if (source[key] !== undefined) migrated[key] = clone(source[key])
      }
      const config = migrated[CONFIG_KEY]
      for (const connection of config?.feishu?.connections || []) {
        const id = String(connection?.id || '').trim()
        const secret = String(connection?.appSecret || '').trim()
        if (id && secret) this.keychain.write(id, secret)
        if (connection && typeof connection === 'object') connection.appSecret = ''
      }
      this.logger.info('已从 OpenGit 迁移 Codex 与飞书配置')
    }
    this.persist(migrated)
    return migrated
  }

  persist(nextData = this.data) {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    fs.writeFileSync(temporaryPath, `${JSON.stringify(nextData, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    fs.renameSync(temporaryPath, this.filePath)
    fs.chmodSync(this.filePath, 0o600)
  }

  hydrateConfig(value) {
    const config = clone(value || {})
    const connections = config?.feishu?.connections
    if (!Array.isArray(connections)) return config
    for (const connection of connections) {
      const id = String(connection?.id || '').trim()
      if (id) connection.appSecret = this.keychain.read(id)
    }
    return config
  }

  sanitizeConfig(value) {
    const config = clone(value || {})
    const previousConnections = this.data?.[CONFIG_KEY]?.feishu?.connections || []
    const nextConnections = config?.feishu?.connections || []
    const nextIds = new Set()
    for (const connection of nextConnections) {
      const id = String(connection?.id || '').trim()
      const secret = String(connection?.appSecret || '').trim()
      if (!id) continue
      nextIds.add(id)
      if (secret) this.keychain.write(id, secret)
      connection.appSecret = ''
    }
    for (const connection of previousConnections) {
      const id = String(connection?.id || '').trim()
      if (id && !nextIds.has(id)) this.keychain.delete(id)
    }
    return config
  }

  get(key, defaultValue) {
    const value = this.data[key] === undefined ? defaultValue : this.data[key]
    return key === CONFIG_KEY ? this.hydrateConfig(value) : clone(value)
  }

  set(key, value) {
    this.data[key] = key === CONFIG_KEY ? this.sanitizeConfig(value) : clone(value)
    this.persist()
  }

  delete(key) {
    if (this.data[key] === undefined) return false
    delete this.data[key]
    this.persist()
    return true
  }
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  })
  response.end(body)
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(new Error('请求 JSON 无效'))
      }
    })
    request.on('error', reject)
  })
}

function matchSessionPath(pathname, suffix = '') {
  const expression = suffix
    ? new RegExp(`^/sessions/([^/]+)/${suffix}$`)
    : /^\/sessions\/([^/]+)$/
  const match = pathname.match(expression)
  return match ? decodeURIComponent(match[1]) : ''
}

async function createRuntime() {
  const logger = new RuntimeLogger()
  const openGitRoot = resolveOpenGitRoot()
  const store = new JsonStore({ directory: appSupportDirectory(), logger })
  const {
    CodexMainSessionService,
    createFeishuBridgeManager
  } = require(path.join(openGitRoot, 'electron', 'ipc', 'codex-main-session.js'))
  const {
    createCodexFeishuBridge
  } = require(path.join(openGitRoot, 'electron', 'ipc', 'codex-feishu-bridge.js'))
  const {
    createCodexProactiveNotificationMonitor
  } = require(path.join(openGitRoot, 'electron', 'ipc', 'codex-proactive-notifications.js'))

  let requestedExit = false
  const service = new CodexMainSessionService({
    store,
    getMainWindow: () => null,
    safeLog: (...args) => logger.info(...args),
    safeError: (...args) => logger.error(...args),
    scheduleApplicationRestart: () => {
      requestedExit = true
      setTimeout(() => process.exit(75), 250).unref?.()
    }
  })
  const feishuBridge = createFeishuBridgeManager({
    service,
    createFeishuBridge: createCodexFeishuBridge,
    onKeepAliveChanged: (enabled) => logger.info('飞书锁屏保活:', enabled ? '启用' : '停用'),
    safeLog: (...args) => logger.info(...args),
    safeError: (...args) => logger.error(...args)
  })
  service.setFeishuBridge(feishuBridge)
  const proactiveMonitor = createCodexProactiveNotificationMonitor({
    store,
    request: (method, params, timeoutMs) => service.request(method, params, timeoutMs),
    getRoutes: () => service.getProactiveNotificationRoutes(),
    getOwnedThreadIds: () => service.listSessions().map((session) => session.threadId).filter(Boolean),
    sendNotification: (route, message) => feishuBridge.sendProactiveNotification(route, message),
    safeLog: (...args) => logger.info(...args),
    safeError: (...args) => logger.error(...args)
  })
  service.setProactiveNotificationMonitor(proactiveMonitor)
  proactiveMonitor.stop({ rebaseline: true })

  const token = process.env.CODEXBAR_TOKEN || randomBytes(32).toString('hex')
  const route = async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      sendJson(response, 401, { success: false, error: '未授权' })
      return
    }
    const url = new URL(request.url, 'http://127.0.0.1')
    const pathname = url.pathname
    try {
      if (request.method === 'GET' && pathname === '/health') {
        sendJson(response, 200, { success: true, pid: process.pid, version: 1 })
        return
      }
      if (request.method === 'GET' && pathname === '/state') {
        sendJson(response, 200, { success: true, state: service.getState() })
        return
      }
      if (request.method === 'GET' && pathname === '/config') {
        sendJson(response, 200, { success: true, config: service.getPublicConfig() })
        return
      }
      if (request.method === 'PUT' && pathname === '/config') {
        const payload = await readJson(request)
        const config = await service.updateConfig(payload)
        sendJson(response, 200, { success: true, config, state: service.getState() })
        return
      }
      if (request.method === 'GET' && pathname === '/sessions') {
        sendJson(response, 200, { success: true, sessions: service.listSessions() })
        return
      }
      if (request.method === 'POST' && pathname === '/sessions') {
        const session = service.createNewSession()
        sendJson(response, 200, { success: true, session, state: service.getState() })
        return
      }
      const bindingSessionId = matchSessionPath(pathname, 'binding')
      if (bindingSessionId && request.method === 'PUT') {
        const binding = service.setProjectBinding(bindingSessionId, await readJson(request))
        sendJson(response, 200, { success: true, binding, state: service.getState() })
        return
      }
      if (bindingSessionId && request.method === 'DELETE') {
        const binding = service.clearProjectBinding(bindingSessionId)
        sendJson(response, 200, { success: true, binding, state: service.getState() })
        return
      }
      const deleteSessionId = matchSessionPath(pathname)
      if (deleteSessionId && request.method === 'DELETE') {
        const result = await service.deleteSession(deleteSessionId)
        sendJson(response, 200, { success: true, ...result, state: service.getState() })
        return
      }
      if (request.method === 'GET' && pathname === '/logs') {
        sendJson(response, 200, { success: true, logs: logger.list() })
        return
      }
      if (request.method === 'POST' && pathname === '/codex/restart') {
        await service.restartServer()
        await service.refreshAccount().catch(() => null)
        sendJson(response, 200, { success: true, state: service.getState() })
        return
      }
      if (request.method === 'POST' && pathname === '/feishu/restart') {
        await feishuBridge.restart()
        sendJson(response, 200, { success: true, state: service.getState() })
        return
      }
      if (request.method === 'POST' && pathname === '/runtime/restart') {
        await service.restartServer()
        await feishuBridge.restart()
        await service.refreshAccount().catch(() => null)
        sendJson(response, 200, { success: true, state: service.getState() })
        return
      }
      if (request.method === 'POST' && pathname === '/account/refresh') {
        const account = await service.refreshAccount()
        sendJson(response, 200, { success: true, account, state: service.getState() })
        return
      }
      if (request.method === 'POST' && pathname === '/power/lock') {
        await service.handleScreenLock()
        sendJson(response, 200, { success: true, state: service.getState() })
        return
      }
      if (request.method === 'POST' && ['/power/unlock', '/power/resume'].includes(pathname)) {
        feishuBridge.scheduleRestart(pathname.slice('/power/'.length))
        service.handleScreenUnlock(pathname.slice('/power/'.length))
        sendJson(response, 200, { success: true, state: service.getState() })
        return
      }
      sendJson(response, 404, { success: false, error: '接口不存在' })
    } catch (error) {
      logger.error(`${request.method} ${pathname} 失败:`, error)
      sendJson(response, 500, { success: false, error: redact(error?.message || String(error)) })
    }
  }

  const server = http.createServer((request, response) => {
    route(request, response).catch((error) => {
      logger.error('请求处理失败:', error)
      if (!response.headersSent) sendJson(response, 500, { success: false, error: '请求处理失败' })
      else response.end()
    })
  })
  server.keepAliveTimeout = 5000
  server.headersTimeout = 10000

  const shutdown = async () => {
    server.close()
    await service.cleanup().catch((error) => logger.error('后台清理失败:', error))
    if (!requestedExit) process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  process.once('uncaughtException', (error) => logger.error('未捕获异常:', error))
  process.once('unhandledRejection', (error) => logger.error('未处理 Promise:', error))

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  process.stdout.write(`${JSON.stringify({ ready: true, port: address.port, token })}\n`)

  service.startServer()
    .then(() => service.refreshAccount().catch(() => null))
    .catch((error) => logger.error('Codex app-server 启动失败:', error))
  if (service.getConfig().feishu.connections.some((connection) => connection.enabled)) {
    feishuBridge.start().catch((error) => logger.error('飞书长连接启动失败:', error))
  }

  return { server, service, feishuBridge, logger }
}

createRuntime().catch((error) => {
  process.stderr.write(`[fatal] ${redact(error?.stack || error?.message || String(error))}\n`)
  process.exit(1)
})
