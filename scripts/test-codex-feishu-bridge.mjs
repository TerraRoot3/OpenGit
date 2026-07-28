import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'

const require = createRequire(import.meta.url)
const {
  createCodexFeishuBridge,
  parseFeishuMessageEvent,
  parseFeishuMessageAttachments,
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
  attachments: [],
  parentMessageId: '',
  rootMessageId: '',
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
  true,
  'group instructions should be accepted without an @ mention'
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

const privateImageMessage = parseFeishuMessageEvent({
  event: {
    sender: {
      sender_id: { open_id: 'ou_private' },
      sender_type: 'user'
    },
    message: {
      message_id: 'om_image',
      chat_id: 'oc_private',
      chat_type: 'p2p',
      message_type: 'image',
      content: JSON.stringify({ image_key: 'img_v2_001' })
    }
  }
})
assert.deepEqual(privateImageMessage.attachments, [{
  kind: 'image',
  key: 'img_v2_001',
  name: '',
  messageId: 'om_image'
}])
assert.equal(
  isFeishuInstructionAllowed(privateImageMessage, {
    allowedChatIds: [],
    allowedSenderIds: []
  }),
  true,
  'private image messages should be accepted without text'
)
assert.equal(
  isFeishuInstructionAllowed({
    ...privateImageMessage,
    chatType: 'group',
    chatId: 'oc_group'
  }, {
    allowedChatIds: [],
    allowedSenderIds: []
  }, 'ou_opengit_bot'),
  true,
  'a group attachment should be accepted without an @ mention'
)
assert.deepEqual(
  parseFeishuMessageAttachments({
    message_id: 'om_audio',
    msg_type: 'audio',
    body: {
      content: JSON.stringify({
        file_key: 'file_audio_1',
        file_name: 'voice.opus'
      })
    }
  }),
  [],
  'audio messages are intentionally unsupported in this release'
)
const privateAudioMessage = parseFeishuMessageEvent({
  event: {
    sender: {
      sender_id: { open_id: 'ou_private' },
      sender_type: 'user'
    },
    message: {
      message_id: 'om_audio',
      chat_id: 'oc_private',
      chat_type: 'p2p',
      message_type: 'audio',
      content: JSON.stringify({ file_key: 'file_audio_1' })
    }
  }
})
assert.equal(
  isFeishuInstructionAllowed(privateAudioMessage, {
    allowedChatIds: [],
    allowedSenderIds: []
  }),
  false,
  'private audio messages should remain disabled'
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
const sentMessagePayloads = []
const sentAttachments = []
const bridgeEvents = []
let registeredHandlers = null
let instructionCount = 0
const receivedInstructions = []
let lastAttachmentWorkspace = ''

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
            const content = JSON.parse(payload.data.content)
            if (payload.data.msg_type === 'post') {
              const markdownNode = content?.zh_cn?.content?.[0]?.[0]
              assert.equal(markdownNode?.tag, 'md')
              const text = markdownNode.text
              sentMessages.push(text)
              sentMessagePayloads.push({
                msgType: payload.data.msg_type,
                content,
                receiveId: payload.data.receive_id
              })
              bridgeEvents.push({ type: 'send', text })
            } else {
              sentAttachments.push({
                msgType: payload.data.msg_type,
                content
              })
            }
            return { code: 0 }
          },
          get: async (payload) => {
            assert.equal(payload.path.message_id, 'om_parent_file')
            return {
              code: 0,
              data: {
                items: [{
                  message_id: 'om_parent_file',
                  chat_id: 'oc_group',
                  msg_type: 'file',
                  body: {
                    content: JSON.stringify({
                      file_key: 'file_parent_1',
                      file_name: 'parent.txt'
                    })
                  }
                }]
              }
            }
          }
        },
        messageResource: {
          get: async (payload) => {
            const key = payload.path.file_key
            const body = ['img_v2_001', 'img_group_1'].includes(key)
              ? Buffer.from('fake-image-content')
              : Buffer.from('parent file content')
            return {
              headers: {
                'content-type': ['img_v2_001', 'img_group_1'].includes(key)
                  ? 'image/png'
                  : 'text/plain'
              },
              getReadableStream: () => Readable.from([body])
            }
          }
        },
        image: {
          create: async (payload) => {
            assert.ok(Buffer.isBuffer(payload.data.image))
            return { image_key: 'uploaded_image_1' }
          }
        },
        file: {
          create: async (payload) => {
            assert.ok(Buffer.isBuffer(payload.data.file))
            return { file_key: 'uploaded_file_1' }
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
  onInstruction: async (payload) => {
    instructionCount += 1
    receivedInstructions.push(payload)
    if (payload.messageId === 'om_private_image') {
      lastAttachmentWorkspace = payload.attachmentWorkspace.rootDir
      assert.equal(payload.attachments.length, 1)
      assert.equal(
        fs.readFileSync(payload.attachments[0].path, 'utf8'),
        'fake-image-content'
      )
      const imagePath = `${payload.attachmentWorkspace.outboxDir}/reply.png`
      const filePath = `${payload.attachmentWorkspace.outboxDir}/report.pdf`
      fs.writeFileSync(imagePath, 'reply-image')
      fs.writeFileSync(filePath, 'reply-file')
      return {
        text: '附件已处理',
        attachments: [
          { kind: 'image', name: 'reply.png', path: imagePath },
          { kind: 'file', name: 'report.pdf', path: filePath }
        ]
      }
    }
    if (payload.messageId === 'om_bridge_bot') {
      await payload.onAgentMessage({
        id: 'agent-progress',
        text: '**第一条回复**'
      })
      bridgeEvents.push({ type: 'instruction-complete' })
      return {
        text: '**第一条回复**\n\n## 任务总结\n\n- 已完成',
        messages: ['**第一条回复**', '## 任务总结\n\n- 已完成'],
        messageItems: [
          { id: 'agent-progress', text: '**第一条回复**' },
          { id: 'agent-final', text: '## 任务总结\n\n- 已完成' }
        ]
      }
    }
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
  ['**第一条回复**', '## 任务总结\n\n- 已完成'],
  'every Codex response from the turn should be returned in order'
)
assert.ok(
  sentMessagePayloads.every((item) => (
    item.msgType === 'post'
    && item.content?.zh_cn?.content?.[0]?.[0]?.tag === 'md'
  )),
  'Codex replies should use Feishu post markdown payloads'
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
      text: '**第一条回复**'
    },
    {
      type: 'instruction-complete'
    },
    {
      type: 'send',
      text: '## 任务总结\n\n- 已完成'
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

await registeredHandlers['im.message.receive_v1']({
  sender: {
    sender_id: { open_id: 'ou_sender' },
    sender_type: 'user'
  },
  message: {
    message_id: 'om_group_bare_image',
    chat_id: 'oc_group',
    chat_type: 'group',
    message_type: 'image',
    content: JSON.stringify({ image_key: 'img_group_1' })
  }
})
await registeredHandlers['im.message.receive_v1']({
  sender: {
    sender_id: { open_id: 'ou_private' },
    sender_type: 'user'
  },
  message: {
    message_id: 'om_private_image',
    chat_id: 'oc_private',
    chat_type: 'p2p',
    message_type: 'image',
    content: JSON.stringify({ image_key: 'img_v2_001' })
  }
})
await registeredHandlers['im.message.receive_v1']({
  sender: {
    sender_id: { open_id: 'ou_sender' },
    sender_type: 'user'
  },
  message: {
    message_id: 'om_group_reply',
    parent_id: 'om_parent_file',
    chat_id: 'oc_group',
    chat_type: 'group',
    message_type: 'text',
    content: JSON.stringify({ text: '@_user_2 读取这个附件' }),
    mentions: [{
      key: '@_user_2',
      name: 'OpenGit',
      id: { open_id: 'ou_bridge_bot' }
    }]
  }
})

for (
  let index = 0;
  index < 50 && (
    instructionCount < 4
    || sentAttachments.length < 2
    || (lastAttachmentWorkspace && fs.existsSync(lastAttachmentWorkspace))
  );
  index += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 20))
}
assert.equal(
  instructionCount,
  4,
  'plain group attachments, private attachments, and group replies should be processed'
)
assert.equal(
  receivedInstructions.find((item) => item.messageId === 'om_group_bare_image')
    ?.attachments?.[0]?.kind,
  'image'
)
assert.equal(
  receivedInstructions.find((item) => item.messageId === 'om_group_reply')
    ?.attachments?.[0]?.name,
  'parent.txt'
)
assert.deepEqual(
  sentAttachments.map((item) => item.msgType),
  ['image', 'file']
)
assert.deepEqual(sentAttachments[0].content, {
  image_key: 'uploaded_image_1'
})
assert.deepEqual(sentAttachments[1].content, {
  file_key: 'uploaded_file_1'
})
assert.equal(
  fs.existsSync(lastAttachmentWorkspace),
  false,
  'the per-task attachment workspace should be removed after replying'
)
await bridge.sendProactiveNotification(
  'oc_proactive_bound',
  '**Codex 任务完成**\n\n构建通过。'
)
assert.equal(sentMessagePayloads.at(-1).receiveId, 'oc_proactive_bound')
assert.match(sentMessages.at(-1), /Codex 任务完成/)
await bridge.stop()

console.log('codex feishu bridge assertions passed')
