const DEFAULT_MESSAGE_CHUNK_LENGTH = 3500
const MESSAGE_DEDUP_TTL_MS = 24 * 60 * 60 * 1000
const MAX_DEDUP_MESSAGES = 2000

function parseMaybeJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function normalizeStringList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,]/)
  return Array.from(new Set(
    source
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ))
}

function stripFeishuMentions(text, mentions = []) {
  let result = String(text || '')
  for (const mention of Array.isArray(mentions) ? mentions : []) {
    const key = String(mention?.key || '').trim()
    const name = String(mention?.name || '').trim()
    if (key) result = result.split(key).join(' ')
    if (name) {
      result = result.replace(new RegExp(`@${escapeRegExp(name)}`, 'g'), ' ')
    }
  }
  return result.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseFeishuMessageEvent(payload = {}) {
  const event = payload?.event && typeof payload.event === 'object'
    ? payload.event
    : payload
  const message = event?.message || event?.data?.message
  const sender = event?.sender || event?.data?.sender
  if (!message || !sender) return null

  const senderId = sender?.sender_id || sender?.senderId || {}
  const content = parseMaybeJson(message.content)
    || parseMaybeJson(message?.body?.content)
    || {}
  const mentions = Array.isArray(message.mentions)
    ? message.mentions
    : (Array.isArray(content.mentions) ? content.mentions : [])
  const messageType = String(message.message_type || '').trim().toLowerCase()
  const chatType = String(message.chat_type || '').trim().toLowerCase()
  const rawText = typeof content.text === 'string'
    ? content.text
    : (typeof message.content === 'string' && !parseMaybeJson(message.content)
        ? message.content
        : '')

  return {
    messageId: String(message.message_id || message.open_message_id || '').trim(),
    chatId: String(message.chat_id || message.open_chat_id || '').trim(),
    chatType,
    messageType,
    text: stripFeishuMentions(rawText, mentions),
    mentioned: mentions.length > 0,
    senderType: String(sender.sender_type || '').trim().toLowerCase(),
    senderOpenId: String(senderId.open_id || senderId.openId || '').trim(),
    senderUserId: String(senderId.user_id || senderId.userId || '').trim(),
    senderUnionId: String(senderId.union_id || senderId.unionId || '').trim()
  }
}

function isFeishuInstructionAllowed(payload = {}, config = {}) {
  if (!payload.chatId || !payload.text || payload.messageType !== 'text') return false
  if (payload.senderType && payload.senderType !== 'user') return false
  if (payload.chatType === 'group' && !payload.mentioned) return false

  const allowedChatIds = new Set(normalizeStringList(config.allowedChatIds))
  if (allowedChatIds.size > 0 && !allowedChatIds.has(payload.chatId)) return false

  const allowedSenderIds = new Set(normalizeStringList(config.allowedSenderIds))
  if (allowedSenderIds.size === 0) return true
  return [
    payload.senderOpenId,
    payload.senderUserId,
    payload.senderUnionId
  ].some((senderId) => senderId && allowedSenderIds.has(senderId))
}

function splitFeishuText(value, maxLength = DEFAULT_MESSAGE_CHUNK_LENGTH) {
  const text = String(value || '').trim()
  if (!text) return []
  const limit = Math.max(200, Number(maxLength) || DEFAULT_MESSAGE_CHUNK_LENGTH)
  const chunks = []
  let remaining = text

  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit + 1)
    const newlineIndex = candidate.lastIndexOf('\n')
    const spaceIndex = candidate.lastIndexOf(' ')
    const preferredIndex = Math.max(
      newlineIndex >= Math.floor(limit * 0.55) ? newlineIndex : -1,
      spaceIndex >= Math.floor(limit * 0.75) ? spaceIndex : -1
    )
    const splitIndex = preferredIndex >= 0 ? preferredIndex : limit
    chunks.push(remaining.slice(0, splitIndex).trim())
    remaining = remaining.slice(splitIndex).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks.filter(Boolean)
}

function createCodexFeishuBridge({
  getConfig,
  onInstruction,
  onStatusChanged = () => {},
  safeLog = () => {},
  safeError = () => {},
  larkSdk = null
} = {}) {
  let lark = larkSdk
  let apiClient = null
  let wsClient = null
  let status = 'disabled'
  let lastError = ''
  let restartSequence = 0
  const seenMessages = new Map()

  const notifyStatus = () => {
    try {
      onStatusChanged()
    } catch (error) {}
  }

  const setStatus = (nextStatus, error = '') => {
    status = String(nextStatus || 'disabled')
    lastError = String(error || '')
    notifyStatus()
  }

  const pruneSeenMessages = () => {
    const cutoff = Date.now() - MESSAGE_DEDUP_TTL_MS
    for (const [messageId, timestamp] of seenMessages) {
      if (timestamp >= cutoff && seenMessages.size <= MAX_DEDUP_MESSAGES) break
      seenMessages.delete(messageId)
    }
  }

  const isDuplicateMessage = (messageId) => {
    const normalizedId = String(messageId || '').trim()
    if (!normalizedId) return false
    pruneSeenMessages()
    if (seenMessages.has(normalizedId)) return true
    seenMessages.set(normalizedId, Date.now())
    return false
  }

  const sendText = async (chatId, text) => {
    if (!apiClient) throw new Error('飞书消息客户端未连接')
    const response = await apiClient.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: String(text || '') })
      }
    })
    if (response?.code && response.code !== 0) {
      throw new Error(response.msg || `飞书消息发送失败 (${response.code})`)
    }
    return response
  }

  const sendChunks = async (chatId, text) => {
    const chunks = splitFeishuText(text)
    for (const [index, chunk] of chunks.entries()) {
      const prefix = chunks.length > 1 ? `[${index + 1}/${chunks.length}] ` : ''
      await sendText(chatId, `${prefix}${chunk}`)
    }
  }

  const processInstruction = async (payload) => {
    let result
    try {
      result = await onInstruction(payload)
    } catch (error) {
      const message = error?.message || String(error)
      safeError('[Codex Feishu] 指令执行失败:', message)
      try {
        await sendChunks(payload.chatId, `Codex 执行失败\n\n${message}`)
      } catch (sendError) {
        safeError('[Codex Feishu] 失败消息回传失败:', sendError.message)
      }
      return
    }

    try {
      const summary = String(result?.text || '').trim() || '任务已完成。'
      await sendChunks(payload.chatId, summary)
    } catch (error) {
      safeError('[Codex Feishu] 执行结果回传失败:', error.message)
    }
  }

  const handleMessageEvent = async (data) => {
    const payload = parseFeishuMessageEvent(data)
    const config = getConfig?.() || {}
    if (!payload || !isFeishuInstructionAllowed(payload, config)) return
    if (isDuplicateMessage(payload.messageId)) return
    safeLog('[Codex Feishu] 收到允许的文本指令:', {
      chatType: payload.chatType,
      messageId: payload.messageId,
      textLength: payload.text.length
    })
    void processInstruction(payload)
  }

  const stop = async () => {
    restartSequence += 1
    const activeWsClient = wsClient
    wsClient = null
    apiClient = null
    if (activeWsClient) {
      try {
        if (typeof activeWsClient.close === 'function') {
          activeWsClient.close({ force: true })
        } else if (typeof activeWsClient.stop === 'function') {
          activeWsClient.stop()
        }
      } catch (error) {
        safeError('[Codex Feishu] 停止长连接失败:', error.message)
      }
    }
    setStatus('disabled')
  }

  const start = async () => {
    const config = getConfig?.() || {}
    if (!config.enabled) {
      await stop()
      return false
    }
    const appId = String(config.appId || '').trim()
    const appSecret = String(config.appSecret || '').trim()
    if (!appId || !appSecret) {
      setStatus('error', '请填写飞书 App ID 和 App Secret')
      throw new Error(lastError)
    }
    if (!/^cli_[0-9a-fA-F]{16}$/.test(appId)) {
      setStatus('error', '飞书 App ID 格式无效')
      throw new Error(lastError)
    }
    if (wsClient) return true

    const sequence = ++restartSequence
    setStatus('connecting')
    try {
      lark ||= require('@larksuiteoapi/node-sdk')
      apiClient = new lark.Client({
        appId,
        appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel?.error
      })
      const dispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': handleMessageEvent
      })
      wsClient = new lark.WSClient({
        appId,
        appSecret,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel?.error,
        autoReconnect: true,
        handshakeTimeoutMs: 20 * 1000,
        onReady: () => {
          if (sequence !== restartSequence) return
          setStatus('connected')
        },
        onReconnecting: () => {
          if (sequence !== restartSequence) return
          setStatus('reconnecting')
        },
        onReconnected: () => {
          if (sequence !== restartSequence) return
          setStatus('connected')
        },
        onError: (error) => {
          if (sequence !== restartSequence) return
          const message = error?.message || String(error || '飞书长连接失败')
          setStatus('error', message)
        }
      })
      await wsClient.start({ eventDispatcher: dispatcher })
      safeLog('[Codex Feishu] 长连接已启动')
      return true
    } catch (error) {
      wsClient = null
      apiClient = null
      setStatus('error', error?.message || String(error))
      throw error
    }
  }

  const restart = async () => {
    await stop()
    const config = getConfig?.() || {}
    return config.enabled ? start() : false
  }

  const getStatus = () => {
    const connectionStatus = wsClient?.getConnectionStatus?.()
    const connectionState = String(connectionStatus?.state || status || 'disabled')
    return {
      enabled: getConfig?.()?.enabled === true,
      running: Boolean(wsClient),
      status: connectionState,
      error: lastError,
      reconnectAttempts: Number(connectionStatus?.reconnectAttempts) || 0
    }
  }

  return {
    start,
    stop,
    restart,
    getStatus
  }
}

module.exports = {
  createCodexFeishuBridge,
  parseFeishuMessageEvent,
  isFeishuInstructionAllowed,
  splitFeishuText,
  stripFeishuMentions
}
