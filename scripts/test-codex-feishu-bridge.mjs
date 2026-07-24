import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createCodexFeishuBridge,
  parseFeishuMessageEvent,
  isFeishuInstructionAllowed,
  resolveFeishuBotOpenId,
  splitFeishuText,
  stripFeishuMentions
} = require('../electron/ipc/codex-feishu-bridge.js')

const groupMessage = parseFeishuMessageEvent({
  sender: {
    sender_id: {
      open_id: 'ou_sender',
      user_id: 'user_sender',
      union_id: 'on_sender'
    },
    sender_type: 'user'
  },
  message: {
    message_id: 'om_001',
    chat_id: 'oc_group',
    chat_type: 'group',
    message_type: 'text',
    content: JSON.stringify({ text: '@_user_1 帮我检查并修复构建' }),
    mentions: [{
      key: '@_user_1',
      name: 'OpenGit',
      id: { open_id: 'ou_opengit_bot' }
    }]
  }
})

assert.deepEqual(groupMessage, {
  messageId: 'om_001',
  chatId: 'oc_group',
  chatType: 'group',
  messageType: 'text',
  text: '帮我检查并修复构建',
  mentioned: true,
  mentionedOpenIds: ['ou_opengit_bot'],
  senderType: 'user',
  senderOpenId: 'ou_sender',
  senderUserId: 'user_sender',
  senderUnionId: 'on_sender'
})
assert.equal(
  isFeishuInstructionAllowed(groupMessage, {
    allowedChatIds: ['oc_group'],
    allowedSenderIds: ['ou_sender']
  }, 'ou_opengit_bot'),
  true
)
assert.equal(
  isFeishuInstructionAllowed(
    { ...groupMessage, mentioned: false, mentionedOpenIds: [] },
    { allowedChatIds: [], allowedSenderIds: [] },
    'ou_opengit_bot'
  ),
  false,
  'group instructions must mention the bot'
)
assert.equal(
  isFeishuInstructionAllowed(
    groupMessage,
    { allowedChatIds: [], allowedSenderIds: [] },
    'ou_another_bot'
  ),
  false,
  'a group instruction mentioning another bot must be ignored'
)
assert.equal(
  isFeishuInstructionAllowed(
    { ...groupMessage, senderType: 'app' },
    { allowedChatIds: [], allowedSenderIds: [] },
    'ou_opengit_bot'
  ),
  false,
  'bot/app messages must not loop back into Codex'
)
assert.equal(
  isFeishuInstructionAllowed(groupMessage, {
    allowedChatIds: ['oc_other'],
    allowedSenderIds: []
  }, 'ou_opengit_bot'),
  false
)
assert.equal(
  isFeishuInstructionAllowed(groupMessage, {
    allowedChatIds: [],
    allowedSenderIds: ['ou_other']
  }, 'ou_opengit_bot'),
  false
)
const privateMessage = parseFeishuMessageEvent({
  event: {
    sender: {
      sender_id: { open_id: 'ou_private' },
      sender_type: 'user'
    },
    message: {
      message_id: 'om_002',
      chat_id: 'oc_private',
      chat_type: 'p2p',
      message_type: 'text',
      content: JSON.stringify({ text: '查看当前项目状态' })
    }
  }
})
assert.deepEqual(privateMessage.mentionedOpenIds, [])
assert.equal(
  isFeishuInstructionAllowed(privateMessage, {
    allowedChatIds: [],
    allowedSenderIds: []
  }),
  true,
  'private text messages do not require an @ mention'
)

assert.equal(
  stripFeishuMentions('@_user_1 @OpenGit 执行测试', [
    { key: '@_user_1', name: 'OpenGit' }
  ]),
  '执行测试'
)

const chunks = splitFeishuText('第一段 '.repeat(80), 220)
assert.ok(chunks.length > 1)
assert.ok(chunks.every((chunk) => chunk.length <= 220))
assert.equal(chunks.join('').replace(/\s/g, ''), '第一段'.repeat(80))

const sentMessages = []
const bridgeEvents = []
let registeredHandlers = null
let instructionCount = 0

class FakeEventDispatcher {
  register(handlers) {
    registeredHandlers = handlers
    return this
  }
}

class FakeClient {
  constructor() {
    this.im = {
      v1: {
        message: {
          create: async (payload) => {
            const text = JSON.parse(payload.data.content).text
            sentMessages.push(text)
            bridgeEvents.push({ type: 'send', text })
            return { code: 0 }
          }
        },
        messageReaction: {
          create: async (payload) => {
            bridgeEvents.push({
              type: 'reaction-add',
              messageId: payload.path.message_id,
              emojiType: payload.data.reaction_type.emoji_type
            })
            return {
              code: 0,
              data: { reaction_id: 'reaction_typing_1' }
            }
          },
          delete: async (payload) => {
            bridgeEvents.push({
              type: 'reaction-remove',
              messageId: payload.path.message_id,
              reactionId: payload.path.reaction_id
            })
            return { code: 0 }
          }
        }
      }
    }
  }

  async request(payload) {
    assert.deepEqual(payload, {
      url: '/open-apis/bot/v3/info',
      method: 'GET'
    })
    return {
      code: 0,
      bot: {
        open_id: 'ou_bridge_bot',
        app_name: 'OpenGit'
      }
    }
  }
}

let wsOptions = null
class FakeWsClient {
  constructor(options) {
    this.options = options
    wsOptions = options
  }

  async start() {
    this.options.onReady?.()
  }

  close() {}

  getConnectionStatus() {
    return { state: 'connected', reconnectAttempts: 0 }
  }
}

const bridge = createCodexFeishuBridge({
  getConfig: () => ({
    enabled: true,
    appId: 'cli_0123456789abcdef',
    appSecret: 'secret',
    allowedChatIds: [],
    allowedSenderIds: []
  }),
  onInstruction: async () => {
    instructionCount += 1
    return { text: '任务总结' }
  },
  larkSdk: {
    Client: FakeClient,
    WSClient: FakeWsClient,
    EventDispatcher: FakeEventDispatcher,
    AppType: { SelfBuild: 'self-build' },
    Domain: { Feishu: 'feishu' },
    LoggerLevel: { error: 0 }
  }
})

await bridge.start()
assert.equal(
  await resolveFeishuBotOpenId(new FakeClient()),
  'ou_bridge_bot'
)
assert.equal(wsOptions?.handshakeTimeoutMs, 60 * 1000)
assert.deepEqual(wsOptions?.wsConfig, { pingTimeout: 15 })
await registeredHandlers['im.message.receive_v1']({
  sender: {
    sender_id: { open_id: 'ou_sender' },
    sender_type: 'user'
  },
  message: {
    message_id: 'om_other_bot',
    chat_id: 'oc_group',
    chat_type: 'group',
    message_type: 'text',
    content: JSON.stringify({ text: '@_user_1 不应执行' }),
    mentions: [{
      key: '@_user_1',
      name: '其他机器人',
      id: { open_id: 'ou_other_bot' }
    }]
  }
})
await registeredHandlers['im.message.receive_v1']({
  sender: {
    sender_id: { open_id: 'ou_sender' },
    sender_type: 'user'
  },
  message: {
    message_id: 'om_bridge_bot',
    chat_id: 'oc_group',
    chat_type: 'group',
    message_type: 'text',
    content: JSON.stringify({ text: '@_user_2 执行任务' }),
    mentions: [{
      key: '@_user_2',
      name: 'OpenGit',
      id: { open_id: 'ou_bridge_bot' }
    }]
  }
})
await new Promise((resolve) => setTimeout(resolve, 20))

assert.equal(
  instructionCount,
  1,
  'an accepted Feishu message should enter Codex exactly once'
)
assert.deepEqual(
  sentMessages,
  ['任务总结'],
  'the Codex final response should be returned without acknowledgements or prefixes'
)
assert.deepEqual(
  bridgeEvents,
  [
    {
      type: 'reaction-add',
      messageId: 'om_bridge_bot',
      emojiType: 'Typing'
    },
    {
      type: 'send',
      text: '任务总结'
    },
    {
      type: 'reaction-remove',
      messageId: 'om_bridge_bot',
      reactionId: 'reaction_typing_1'
    }
  ],
  'only the targeted bot should add Typing and remove it after returning the result'
)
assert.equal(bridge.getStatus().status, 'connected')
await bridge.stop()

console.log('codex feishu bridge assertions passed')
