const MCP_CONFIG_KEY = 'mcpConfig'

function getDefaultMcpConfig() {
  return {
    enabled: false,
    host: '127.0.0.1',
    port: 3765,
    capabilities: {
      projects: true,
      terminals: true,
      remotesRead: true,
      terminalsWrite: false,
      remotesWrite: false,
      remotesRequest: false
    }
  }
}

function normalizePort(value, fallback) {
  const numericPort = Number.parseInt(value, 10)
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return fallback
  }
  return numericPort
}

function normalizeMcpConfig(input = {}) {
  const defaults = getDefaultMcpConfig()
  const capabilities = input && typeof input.capabilities === 'object' ? input.capabilities : {}

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    host: typeof input.host === 'string' && input.host.trim() ? input.host.trim() : defaults.host,
    port: normalizePort(input.port, defaults.port),
    capabilities: {
      projects: typeof capabilities.projects === 'boolean' ? capabilities.projects : defaults.capabilities.projects,
      terminals: typeof capabilities.terminals === 'boolean' ? capabilities.terminals : defaults.capabilities.terminals,
      remotesRead: typeof capabilities.remotesRead === 'boolean' ? capabilities.remotesRead : defaults.capabilities.remotesRead,
      terminalsWrite: typeof capabilities.terminalsWrite === 'boolean' ? capabilities.terminalsWrite : defaults.capabilities.terminalsWrite,
      remotesWrite: typeof capabilities.remotesWrite === 'boolean' ? capabilities.remotesWrite : defaults.capabilities.remotesWrite,
      remotesRequest: typeof capabilities.remotesRequest === 'boolean' ? capabilities.remotesRequest : defaults.capabilities.remotesRequest
    }
  }
}

function getMcpConfig(store) {
  return normalizeMcpConfig(store.get(MCP_CONFIG_KEY, getDefaultMcpConfig()))
}

function saveMcpConfig(store, partial = {}) {
  const current = getMcpConfig(store)
  const nextConfig = normalizeMcpConfig({
    ...current,
    ...partial,
    capabilities: {
      ...current.capabilities,
      ...(partial && typeof partial.capabilities === 'object' ? partial.capabilities : {})
    }
  })

  store.set(MCP_CONFIG_KEY, nextConfig)
  return nextConfig
}

module.exports = {
  MCP_CONFIG_KEY,
  getDefaultMcpConfig,
  getMcpConfig,
  saveMcpConfig
}
