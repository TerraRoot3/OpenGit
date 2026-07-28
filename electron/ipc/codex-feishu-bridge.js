const DEFAULT_MESSAGE_CHUNK_LENGTH = 3500
const MESSAGE_DEDUP_TTL_MS = 24 * 60 * 60 * 1000
const MAX_DEDUP_MESSAGES = 2000
const FEISHU_PING_TIMEOUT_SECONDS = 15
const FEISHU_HANDSHAKE_TIMEOUT_MS = 60 * 1000
const FEISHU_TYPING_REACTION = 'Typing'
const {
  createAttachmentWorkspace,
  cleanupAttachmentWorkspace,
  pruneExpiredAttachmentWorkspaces,
  downloadFeishuAttachments,
  sendFeishuOutputAttachment
} = require('./codex-feishu-attachments')

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

function collectFeishuContentSignals(node, output) {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) collectFeishuContentSignals(item, output)
    return
  }
  if (typeof node !== 'object') return

  const imageKey = String(node.image_key || '').trim()
  if (imageKey) output.images.add(imageKey)
  const fileKey = String(node.file_key || '').trim()
  if (fileKey && !output.files.has(fileKey)) {
    output.files.set(
      fileKey,
      String(node.file_name || node.name || '').trim()
    )
  }
  for (const key of ['text', 'title']) {
    const text = typeof node[key] === 'string' ? node[key].trim() : ''
    if (text) output.texts.add(text)
  }
  for (const value of Object.values(node)) {
    collectFeishuContentSignals(value, output)
  }
}

function parseFeishuMessageAttachments(message = {}, content = null) {
  const messageType = String(
    message.message_type
    || message.msg_type
    || ''
  ).trim().toLowerCase()
  const contentObject = content && typeof content === 'object'
    ? content
    : (
        parseMaybeJson(message.content)
        || parseMaybeJson(message?.body?.content)
        || {}
      )
  const signals = {
    images: new Set(),
    files: new Map(),
    texts: new Set()
  }
  collectFeishuContentSignals(contentObject, signals)

  const topImageKey = String(message.image_key || '').trim()
  if (topImageKey) signals.images.add(topImageKey)
  const topFileKey = String(message.file_key || '').trim()
  if (topFileKey && !signals.files.has(topFileKey)) {
    signals.files.set(topFileKey, String(message.file_name || '').trim())
  }

  const attachments = []
  for (const imageKey of signals.images) {
    attachments.push({ kind: 'image', key: imageKey, name: '' })
  }
  for (const [fileKey, fileName] of signals.files) {
    if (messageType === 'audio') continue
    attachments.push({
      kind: 'file',
      key: fileKey,
      name: fileName
    })
  }
  return attachments
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
  const mentionedOpenIds = Array.from(new Set(
    mentions
      .map((mention) => String(
        mention?.id?.open_id
        || mention?.id?.openId
        || mention?.open_id
        || mention?.openId
        || ''
      ).trim())
      .filter(Boolean)
  ))
  const messageType = String(
    message.message_type
    || message.msg_type
    || ''
  ).trim().toLowerCase()
  const chatType = String(message.chat_type || '').trim().toLowerCase()
  const contentSignals = {
    images: new Set(),
    files: new Map(),
    texts: new Set()
  }
  collectFeishuContentSignals(content, contentSignals)
  const rawText = contentSignals.texts.size > 0
    ? Array.from(contentSignals.texts).join(' ')
    : (
        typeof message.content === 'string' && !parseMaybeJson(message.content)
          ? message.content
          : ''
      )
  const messageId = String(
    message.message_id
    || message.open_message_id
    || ''
  ).trim()
  const attachments = parseFeishuMessageAttachments(message, content)
    .map((attachment) => ({
      ...attachment,
      messageId
    }))

  return {
    messageId,
    chatId: String(message.chat_id || message.open_chat_id || '').trim(),
    chatType,
    messageType,
    text: stripFeishuMentions(rawText, mentions),
    attachments,
    parentMessageId: String(
      message.parent_id
      || message.parentId
      || message.upper_message_id
      || ''
    ).trim(),
    rootMessageId: String(message.root_id || message.rootId || '').trim(),
    mentioned: mentions.length > 0,
    mentionedOpenIds,
    senderType: String(sender.sender_type || '').trim().toLowerCase(),
    senderOpenId: String(senderId.open_id || senderId.openId || '').trim(),
    senderUserId: String(senderId.user_id || senderId.userId || '').trim(),
    senderUnionId: String(senderId.union_id || senderId.unionId || '').trim()
  }
}

function isFeishuInstructionAllowed(payload = {}, config = {}, botOpenId = '') {
  const supportedMessageTypes = new Set(['text', 'post', 'image', 'file'])
  const hasAttachments = Array.isArray(payload.attachments)
    && payload.attachments.length > 0
  const repliesToMessage = Boolean(
    String(payload.parentMessageId || payload.rootMessageId || '').trim()
  )
  if (
    !payload.chatId
    || !supportedMessageTypes.has(payload.messageType)
    || (!payload.text && !hasAttachments && !repliesToMessage)
  ) return false
  if (payload.senderType && payload.senderType !== 'user') return false
  if (payload.chatType === 'group') {
    const mentionedOpenIds = Array.isArray(payload.mentionedOpenIds)
      ? payload.mentionedOpenIds
      : []
    const hasExplicitMention = payload.mentioned === true
      || mentionedOpenIds.length > 0
    const normalizedBotOpenId = String(botOpenId || '').trim()
    if (
      hasExplicitMention
      && (
        !normalizedBotOpenId
        || !mentionedOpenIds.includes(normalizedBotOpenId)
      )
    ) return false
  }

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

async function resolveFeishuBotOpenId(apiClient) {
  if (!apiClient?.request) throw new Error('飞书客户端不支持读取机器人身份')
  const response = await apiClient.request({
    url: '/open-apis/bot/v3/info',
    method: 'GET'
  })
  if (response?.code && response.code !== 0) {
    throw new Error(response.msg || `飞书机器人身份读取失败 (${response.code})`)
  }
  const bot = response?.bot || response?.data?.bot || {}
  const openId = String(bot.open_id || bot.openId || '').trim()
  if (!openId) throw new Error('飞书机器人身份缺少 open_id')
  return openId
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
  let botOpenId = ''
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

  const sendMarkdown = async (chatId, markdown, client = apiClient) => {
    if (!client) throw new Error('飞书消息客户端未连接')
    const response = await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'post',
        content: JSON.stringify({
          zh_cn: {
            content: [[{
              tag: 'md',
              text: String(markdown || '')
            }]]
          }
        })
      }
    })
    if (response?.code && response.code !== 0) {
      throw new Error(response.msg || `飞书消息发送失败 (${response.code})`)
    }
    return response
  }

  const sendChunks = async (chatId, text, client = apiClient) => {
    const chunks = splitFeishuText(text)
    for (const [index, chunk] of chunks.entries()) {
      const prefix = chunks.length > 1 ? `[${index + 1}/${chunks.length}] ` : ''
      await sendMarkdown(chatId, `${prefix}${chunk}`, client)
    }
  }

  const addTypingReaction = async (messageId, client = apiClient) => {
    const normalizedMessageId = String(messageId || '').trim()
    if (!normalizedMessageId || !client) return ''
    const response = await client.im.v1.messageReaction.create({
      path: { message_id: normalizedMessageId },
      data: {
        reaction_type: {
          emoji_type: FEISHU_TYPING_REACTION
        }
      }
    })
    if (response?.code && response.code !== 0) {
      throw new Error(response.msg || `飞书处理中表情添加失败 (${response.code})`)
    }
    return String(
      response?.data?.reaction_id
      || response?.reaction_id
      || ''
    ).trim()
  }

  const removeTypingReaction = async (messageId, reactionId, client = apiClient) => {
    const normalizedMessageId = String(messageId || '').trim()
    const normalizedReactionId = String(reactionId || '').trim()
    if (!normalizedMessageId || !normalizedReactionId || !client) return
    const response = await client.im.v1.messageReaction.delete({
      path: {
        message_id: normalizedMessageId,
        reaction_id: normalizedReactionId
      }
    })
    if (response?.code && response.code !== 0) {
      throw new Error(response.msg || `飞书处理中表情移除失败 (${response.code})`)
    }
  }

  const resolveReplyAttachments = async (payload, client) => {
    if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      return payload.attachments
    }
    if (!client?.im?.v1?.message?.get) return []
    const relatedMessageIds = Array.from(new Set([
      payload.parentMessageId,
      payload.rootMessageId
    ].map((value) => String(value || '').trim()).filter(Boolean)))

    for (const messageId of relatedMessageIds) {
      const response = await client.im.v1.message.get({
        path: { message_id: messageId }
      })
      if (response?.code && response.code !== 0) {
        throw new Error(response.msg || `飞书被回复消息读取失败 (${response.code})`)
      }
      const items = response?.data?.items || response?.items || []
      const message = Array.isArray(items) ? items[0] : null
      if (!message) continue
      const repliedChatId = String(message.chat_id || '').trim()
      if (repliedChatId && repliedChatId !== payload.chatId) continue
      const attachments = parseFeishuMessageAttachments(message)
        .map((attachment) => ({
          ...attachment,
          messageId: String(message.message_id || messageId).trim()
        }))
      if (attachments.length > 0) return attachments
    }
    return []
  }

  const processInstruction = async (payload) => {
    const reactionClient = apiClient
    let typingReactionId = ''
    let attachmentWorkspace = null
    let realtimeReplyChain = Promise.resolve()
    const scheduledReplyKeys = new Set()
    const deliveredReplyKeys = new Set()
    const replyKey = (item = {}) => {
      const itemId = String(item?.id || '').trim()
      const text = String(item?.text || '').trim()
      return itemId ? `id:${itemId}` : `text:${text}`
    }
    const queueRealtimeReply = (item = {}) => {
      const text = String(item?.text || '').trim()
      if (!text) return realtimeReplyChain
      const key = replyKey(item)
      if (scheduledReplyKeys.has(key)) return realtimeReplyChain
      scheduledReplyKeys.add(key)
      realtimeReplyChain = realtimeReplyChain.then(async () => {
        try {
          await sendChunks(payload.chatId, text, reactionClient)
          deliveredReplyKeys.add(key)
        } catch (error) {
          scheduledReplyKeys.delete(key)
          safeError('[Codex Feishu] 实时回复回传失败:', error.message)
        }
      })
      return realtimeReplyChain
    }
    try {
      try {
        typingReactionId = await addTypingReaction(payload.messageId, reactionClient)
      } catch (error) {
        safeError('[Codex Feishu] 处理中表情添加失败:', error.message)
      }

      let result
      try {
        attachmentWorkspace = createAttachmentWorkspace(payload.messageId)
        const rawAttachments = await resolveReplyAttachments(
          payload,
          reactionClient
        )
        const attachments = await downloadFeishuAttachments(
          reactionClient,
          rawAttachments,
          attachmentWorkspace
        )
        const preparedPayload = {
          ...payload,
          text: String(payload.text || '').trim()
            || '请处理这些附件，并直接回复处理结果。',
          attachments,
          attachmentWorkspace,
          onAgentMessage: queueRealtimeReply
        }
        result = await onInstruction(preparedPayload)
      } catch (error) {
        await realtimeReplyChain
        const message = error?.message || String(error)
        safeError('[Codex Feishu] 指令执行失败:', message)
        try {
          await sendChunks(
            payload.chatId,
            `Codex 执行失败\n\n${message}`,
            reactionClient
          )
        } catch (sendError) {
          safeError('[Codex Feishu] 失败消息回传失败:', sendError.message)
        }
        return
      }

      try {
        await realtimeReplyChain
        const resultReplyItems = (
          Array.isArray(result?.messageItems) && result.messageItems.length > 0
            ? result.messageItems
            : (
                Array.isArray(result?.messages) && result.messages.length > 0
                  ? result.messages.map((text) => ({ id: '', text }))
                  : [{ id: '', text: result?.text }]
              )
        )
          .map((item) => ({
            id: String(item?.id || '').trim(),
            text: String(item?.text || '').trim()
          }))
          .filter((item) => item.text)
        const pendingReplyItems = (
          resultReplyItems.length > 0
            ? resultReplyItems
            : [{ id: '', text: '任务已完成。' }]
        ).filter((item) => !deliveredReplyKeys.has(replyKey(item)))
        for (const replyItem of pendingReplyItems) {
          await sendChunks(payload.chatId, replyItem.text, reactionClient)
          deliveredReplyKeys.add(replyKey(replyItem))
        }
        const attachmentErrors = Array.isArray(result?.attachmentErrors)
          ? [...result.attachmentErrors]
          : []
        for (const attachment of Array.isArray(result?.attachments) ? result.attachments : []) {
          try {
            await sendFeishuOutputAttachment(
              reactionClient,
              payload.chatId,
              attachment,
              attachmentWorkspace
            )
          } catch (error) {
            attachmentErrors.push({
              name: attachment?.name || '附件',
              error: error?.message || String(error)
            })
          }
        }
        if (attachmentErrors.length > 0) {
          const details = attachmentErrors
            .map((item) => `- ${item?.name || '附件'}：${item?.error || '发送失败'}`)
            .join('\n')
          await sendChunks(
            payload.chatId,
            `以下附件未能发送：\n${details}`,
            reactionClient
          )
        }
      } catch (error) {
        safeError('[Codex Feishu] 执行结果回传失败:', error.message)
      }
    } finally {
      if (attachmentWorkspace) {
        cleanupAttachmentWorkspace(attachmentWorkspace)
      }
      if (typingReactionId) {
        try {
          await removeTypingReaction(
            payload.messageId,
            typingReactionId,
            reactionClient
          )
        } catch (error) {
          safeError('[Codex Feishu] 处理中表情移除失败:', error.message)
        }
      }
    }
  }

  const handleMessageEvent = async (data) => {
    const payload = parseFeishuMessageEvent(data)
    const config = getConfig?.() || {}
    if (!payload || !isFeishuInstructionAllowed(payload, config, botOpenId)) return
    if (isDuplicateMessage(payload.messageId)) return
    safeLog('[Codex Feishu] 收到允许的指令:', {
      chatType: payload.chatType,
      messageId: payload.messageId,
      textLength: payload.text.length,
      attachmentCount: payload.attachments.length,
      repliedMessage: Boolean(payload.parentMessageId || payload.rootMessageId)
    })
    void processInstruction(payload)
  }

  const stop = async () => {
    restartSequence += 1
    const activeWsClient = wsClient
    wsClient = null
    apiClient = null
    botOpenId = ''
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
      pruneExpiredAttachmentWorkspaces()
      lark ||= require('@larksuiteoapi/node-sdk')
      apiClient = new lark.Client({
        appId,
        appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel?.error
      })
      botOpenId = await resolveFeishuBotOpenId(apiClient)
      const dispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': handleMessageEvent
      })
      wsClient = new lark.WSClient({
        appId,
        appSecret,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel?.error,
        autoReconnect: true,
        handshakeTimeoutMs: FEISHU_HANDSHAKE_TIMEOUT_MS,
        wsConfig: {
          pingTimeout: FEISHU_PING_TIMEOUT_SECONDS
        },
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
      botOpenId = ''
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

  const sendProactiveNotification = async (chatId, message) => {
    const normalizedChatId = String(chatId || '').trim()
    const normalizedMessage = String(message || '').trim()
    if (!normalizedChatId || !normalizedMessage) {
      throw new Error('主动通知缺少 chat_id 或消息内容')
    }
    if (!apiClient || !wsClient) {
      throw new Error('飞书长连接尚未就绪')
    }
    return sendChunks(normalizedChatId, normalizedMessage, apiClient)
  }

  return {
    start,
    stop,
    restart,
    getStatus,
    sendProactiveNotification
  }
}

module.exports = {
  createCodexFeishuBridge,
  parseFeishuMessageEvent,
  parseFeishuMessageAttachments,
  isFeishuInstructionAllowed,
  resolveFeishuBotOpenId,
  splitFeishuText,
  stripFeishuMentions
}
