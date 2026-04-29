const http = require('http')
const { createJsonRpcSuccess, createJsonRpcError, createTextToolResult } = require('./schema')

const MCP_PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = Object.freeze({
  name: 'opengit-embedded-mcp',
  version: '1.0.0'
})

function createJsonRpcDispatcher({ getRegisteredTools, safeError }) {
  const handleInitialize = (id) => createJsonRpcSuccess(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
      resources: {}
    },
    serverInfo: SERVER_INFO
  })

  const handleResourcesList = (id) => createJsonRpcSuccess(id, {
    resources: []
  })

  const handleToolsList = (id) => createJsonRpcSuccess(id, {
    tools: getRegisteredTools().map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} }
    }))
  })

  const handleToolsCall = async (id, params = {}) => {
    const toolName = String(params?.name || '').trim()
    if (!toolName) {
      return createJsonRpcError(id, -32602, 'Missing tool name')
    }

    const tool = getRegisteredTools().find((item) => item.name === toolName)
    if (!tool) {
      return createJsonRpcError(id, -32601, `Unknown tool: ${toolName}`)
    }

    try {
      const result = await tool.handler(params.arguments || {})
      return createJsonRpcSuccess(id, createTextToolResult(result == null ? {} : result))
    } catch (error) {
      safeError(`[MCP] tool call failed for ${toolName}:`, error?.message || error)
      return createJsonRpcSuccess(id, createTextToolResult({
        tool: toolName,
        error: error?.message || 'Unknown error'
      }, { isError: true }))
    }
  }

  return async function handleJsonRpcRequest(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { statusCode: 400, payload: createJsonRpcError(null, -32600, 'Invalid Request') }
    }

    const hasRequestId = Object.prototype.hasOwnProperty.call(payload, 'id')
    const id = hasRequestId ? payload.id : null
    const method = String(payload.method || '').trim()
    if (!method) {
      return { statusCode: 400, payload: createJsonRpcError(id, -32600, 'Missing method') }
    }

    const isNotification = !hasRequestId && method.startsWith('notifications/')

    if (method === 'initialize') {
      return { statusCode: 200, payload: handleInitialize(id) }
    }
    if (method === 'notifications/initialized') {
      return { statusCode: 204, payload: null, noContent: true }
    }
    if (method === 'ping') {
      return { statusCode: 200, payload: createJsonRpcSuccess(id, {}) }
    }
    if (isNotification) {
      return { statusCode: 204, payload: null, noContent: true }
    }
    if (method === 'tools/list') {
      return { statusCode: 200, payload: handleToolsList(id) }
    }
    if (method === 'resources/list') {
      return { statusCode: 200, payload: handleResourcesList(id) }
    }
    if (method === 'tools/call') {
      return { statusCode: 200, payload: await handleToolsCall(id, payload.params || {}) }
    }

    return { statusCode: 404, payload: createJsonRpcError(id, -32601, `Method not found: ${method}`) }
  }
}

function createEmbeddedMcpServer(deps = {}) {
  const safeLog = typeof deps.safeLog === 'function' ? deps.safeLog : () => {}
  const safeError = typeof deps.safeError === 'function' ? deps.safeError : () => {}
  const onStatusChange = typeof deps.onStatusChange === 'function' ? deps.onStatusChange : () => {}
  const getTools = typeof deps.getTools === 'function' ? deps.getTools : () => []

  let server = null
  let activeConfig = {
    enabled: false,
    host: '127.0.0.1',
    port: 3765,
    capabilities: {}
  }
  let status = {
    enabled: false,
    running: false,
    host: '127.0.0.1',
    port: 3765,
    startedAt: null,
    lastError: null
  }

  const getStatus = () => ({ ...status })
  const getActiveConfig = () => ({ ...activeConfig })

  const updateStatus = (patch) => {
    status = {
      ...status,
      ...patch
    }
    onStatusChange(getStatus())
  }

  const getRegisteredTools = () => {
    const tools = getTools(getActiveConfig())
    return Array.isArray(tools)
      ? tools.filter((tool) => tool && typeof tool.name === 'string' && typeof tool.handler === 'function')
      : []
  }

  const sendJson = (res, code, payload) => {
    res.writeHead(code)
    res.end(JSON.stringify(payload))
  }

  const sendNoContent = (res, code = 204) => {
    res.writeHead(code)
    res.end()
  }

  const collectRequestBody = async (req) => {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  const handleJsonRpcRequest = createJsonRpcDispatcher({
    getRegisteredTools,
    safeError
  })

  const createRequestHandler = () => http.createServer((req, res) => {
    const baseUrl = `http://${status.host}:${status.port}`
    const requestUrl = new URL(req.url || '/', baseUrl)

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/mcp' || requestUrl.pathname === '/health' || requestUrl.pathname === '/status')) {
      sendJson(res, 200, {
        service: SERVER_INFO.name,
        serverInfo: SERVER_INFO,
        status: getStatus(),
        config: getActiveConfig(),
        protocolVersion: MCP_PROTOCOL_VERSION,
        toolsRegistered: getRegisteredTools().length
      })
      return
    }

    if (req.method === 'POST' && (requestUrl.pathname === '/' || requestUrl.pathname === '/mcp')) {
      void (async () => {
        try {
          const rawBody = await collectRequestBody(req)
          const payload = rawBody ? JSON.parse(rawBody) : {}
          const response = await handleJsonRpcRequest(payload)
          if (response.noContent) {
            sendNoContent(res, response.statusCode)
            return
          }
          sendJson(res, response.statusCode, response.payload)
        } catch (error) {
          sendJson(res, 500, createJsonRpcError(null, -32700, 'Parse error', error?.message || 'Invalid JSON'))
        }
      })()
      return
    }

    sendJson(res, 404, createJsonRpcError(null, -32601, `Route not found: ${requestUrl.pathname}`))
  })

  async function stop() {
    if (!server) {
      updateStatus({
        running: false,
        startedAt: null
      })
      return getStatus()
    }

    const activeServer = server
    server = null

    await new Promise((resolve) => {
      activeServer.close(() => resolve())
    })

    safeLog('[MCP] embedded server stopped')
    updateStatus({
      running: false,
      startedAt: null,
      lastError: null
    })

    return getStatus()
  }

  async function start(config = {}) {
    const nextHost = typeof config.host === 'string' && config.host.trim() ? config.host.trim() : '127.0.0.1'
    const nextPort = Number.parseInt(config.port, 10) || 3765
    const nextEnabled = !!config.enabled

    activeConfig = {
      ...activeConfig,
      ...config,
      enabled: nextEnabled,
      host: nextHost,
      port: nextPort
    }

    updateStatus({
      enabled: nextEnabled,
      host: nextHost,
      port: nextPort,
      lastError: null
    })

    if (!nextEnabled) {
      await stop()
      return getStatus()
    }

    if (server && status.running && status.host === nextHost && status.port === nextPort) {
      return getStatus()
    }

    if (server) {
      await stop()
      updateStatus({
        enabled: nextEnabled,
        host: nextHost,
        port: nextPort
      })
    }

    return new Promise((resolve) => {
      const nextServer = createRequestHandler()
      let settled = false

      nextServer.once('error', (error) => {
        if (settled) return
        settled = true
        safeError('[MCP] embedded server failed to start:', error.message)
        try {
          nextServer.close()
        } catch (closeError) {
          safeError('[MCP] failed to close server after start error:', closeError.message)
        }
        updateStatus({
          running: false,
          startedAt: null,
          lastError: error.message
        })
        resolve(getStatus())
      })

      nextServer.listen(nextPort, nextHost, () => {
        if (settled) return
        settled = true
        server = nextServer
        safeLog(`[MCP] embedded server listening on http://${nextHost}:${nextPort}`)
        updateStatus({
          running: true,
          startedAt: new Date().toISOString(),
          lastError: null
        })
        resolve(getStatus())
      })
    })
  }

  async function restart(config = {}) {
    await stop()
    return start(config)
  }

  return {
    start,
    stop,
    restart,
    getStatus,
    getActiveConfig
  }
}

module.exports = {
  createEmbeddedMcpServer,
  createJsonRpcDispatcher
}
