const fs = require('fs')
const os = require('os')
const path = require('path')
const { randomUUID } = require('crypto')

const ATTACHMENT_ROOT = path.join(os.tmpdir(), 'opengit-codex-feishu')
const MAX_INBOUND_FILE_BYTES = 30 * 1024 * 1024
const MAX_INBOUND_TOTAL_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_FILE_BYTES = 30 * 1024 * 1024
const MAX_OUTPUT_TOTAL_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_FILES = 20
const WORKSPACE_TTL_MS = 24 * 60 * 60 * 1000

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.ico'
])

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 })
}

function ensureAttachmentRoot() {
  ensureDirectory(ATTACHMENT_ROOT)
  const stats = fs.lstatSync(ATTACHMENT_ROOT)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('飞书附件根目录无效')
  }
  return fs.realpathSync(ATTACHMENT_ROOT)
}

function isPathInside(rootPath, targetPath) {
  const root = path.resolve(rootPath)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function sanitizeAttachmentName(value, fallback = 'attachment.bin') {
  const basename = path.basename(String(value || fallback))
  const safe = basename
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return safe || fallback
}

function createAttachmentWorkspace(seed = '') {
  ensureAttachmentRoot()
  const normalizedSeed = String(seed || '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 60)
  const directoryName = [
    Date.now(),
    normalizedSeed || 'task',
    randomUUID()
  ].join('-')
  const rootDir = path.join(ATTACHMENT_ROOT, directoryName)
  const inboxDir = path.join(rootDir, 'inbox')
  const outboxDir = path.join(rootDir, 'outbox')
  ensureDirectory(inboxDir)
  ensureDirectory(outboxDir)
  return { rootDir, inboxDir, outboxDir }
}

function isOwnedWorkspaceRoot(rootDir) {
  const normalizedRoot = path.resolve(String(rootDir || ''))
  return (
    path.dirname(normalizedRoot) === path.resolve(ATTACHMENT_ROOT)
    && isPathInside(ATTACHMENT_ROOT, normalizedRoot)
  )
}

function resolveSafeOutbox(workspace = {}) {
  const rootDir = String(workspace?.rootDir || '').trim()
  const outboxDir = String(workspace?.outboxDir || '').trim()
  if (
    !rootDir
    || !outboxDir
    || !isOwnedWorkspaceRoot(rootDir)
    || !isPathInside(rootDir, outboxDir)
  ) {
    throw new Error('本轮 outbox 路径无效')
  }
  const rootStats = fs.lstatSync(rootDir)
  const outboxStats = fs.lstatSync(outboxDir)
  const attachmentRootStats = fs.lstatSync(ATTACHMENT_ROOT)
  if (
    !attachmentRootStats.isDirectory()
    || attachmentRootStats.isSymbolicLink()
    || !rootStats.isDirectory()
    || rootStats.isSymbolicLink()
    || !outboxStats.isDirectory()
    || outboxStats.isSymbolicLink()
  ) {
    throw new Error('本轮 outbox 不能是符号链接')
  }
  const realAttachmentRoot = fs.realpathSync(ATTACHMENT_ROOT)
  const realWorkspaceRoot = fs.realpathSync(rootDir)
  const realOutbox = fs.realpathSync(outboxDir)
  if (
    path.dirname(realWorkspaceRoot) !== realAttachmentRoot
    || !isPathInside(realWorkspaceRoot, realOutbox)
  ) {
    throw new Error('本轮 outbox 越过附件任务目录')
  }
  return { realWorkspaceRoot, realOutbox }
}

function cleanupAttachmentWorkspace(workspace = {}) {
  const rootDir = String(workspace?.rootDir || '').trim()
  if (!rootDir || !isOwnedWorkspaceRoot(rootDir)) return false
  try {
    const stats = fs.lstatSync(rootDir)
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false
    fs.rmSync(rootDir, { recursive: true, force: true })
    return true
  } catch (error) {
    return error?.code === 'ENOENT'
  }
}

function pruneExpiredAttachmentWorkspaces(now = Date.now()) {
  ensureAttachmentRoot()
  for (const entry of fs.readdirSync(ATTACHMENT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const target = path.join(ATTACHMENT_ROOT, entry.name)
    if (!isOwnedWorkspaceRoot(target)) continue
    try {
      const stats = fs.lstatSync(target)
      if (now - stats.mtimeMs < WORKSPACE_TTL_MS) continue
      fs.rmSync(target, { recursive: true, force: true })
    } catch (error) {}
  }
}

function normalizeHeaderValue(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return String(headers.get(name) || headers.get(name.toLowerCase()) || '').trim()
  }
  const match = Object.entries(headers).find(
    ([key]) => String(key).toLowerCase() === String(name).toLowerCase()
  )
  return String(match?.[1] || '').trim()
}

function filenameFromDisposition(disposition = '') {
  const text = String(disposition || '')
  const encoded = text.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1])
    } catch (error) {
      return encoded[1]
    }
  }
  const plain = text.match(/filename="?([^";]+)"?/i)
  return plain?.[1] || ''
}

function extensionForMimeType(mimeType = '') {
  const normalized = String(mimeType || '').split(';')[0].trim().toLowerCase()
  return {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4': '.m4a',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/json': '.json'
  }[normalized] || ''
}

function mimeTypeForName(fileName = '', fallback = 'application/octet-stream') {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.ico': 'image/x-icon',
    '.opus': 'audio/opus',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.zip': 'application/zip'
  }[ext] || fallback
}

function classifyAttachmentKind(fileName = '', mimeType = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  const mime = String(mimeType || '').toLowerCase()
  if (mime.startsWith('image/') && IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return 'file'
}

function uniqueDestination(directoryPath, requestedName) {
  const safeName = sanitizeAttachmentName(requestedName)
  const extension = path.extname(safeName)
  const stem = path.basename(safeName, extension)
  let candidate = path.join(directoryPath, safeName)
  let index = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(directoryPath, `${stem}-${index}${extension}`)
    index += 1
  }
  return candidate
}

async function readableToBuffer(readable, limitBytes) {
  if (Buffer.isBuffer(readable)) {
    if (readable.length > limitBytes) throw new Error('附件超过 30MB 限制')
    return readable
  }
  if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') {
    throw new Error('飞书资源响应不包含可读取的数据流')
  }
  const chunks = []
  let total = 0
  for await (const chunk of readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limitBytes) {
      readable.destroy?.()
      throw new Error('附件超过 30MB 限制')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function downloadFeishuAttachments(apiClient, rawAttachments, workspace) {
  const sourceAttachments = Array.isArray(rawAttachments) ? rawAttachments : []
  if (sourceAttachments.length === 0) return []
  if (!apiClient?.im?.v1?.messageResource?.get) {
    throw new Error('飞书客户端不支持下载消息附件')
  }
  const inboxDir = String(workspace?.inboxDir || '')
  if (!inboxDir || !isPathInside(workspace.rootDir, inboxDir)) {
    throw new Error('附件任务目录无效')
  }

  const accepted = []
  let totalBytes = 0
  for (const [index, raw] of sourceAttachments.entries()) {
    const kind = raw?.kind === 'image' ? 'image' : 'file'
    const resourceKey = String(raw?.key || '').trim()
    const messageId = String(raw?.messageId || '').trim()
    if (!resourceKey || !messageId) throw new Error('飞书附件缺少资源键或消息 ID')

    const response = await apiClient.im.v1.messageResource.get({
      path: {
        message_id: messageId,
        file_key: resourceKey
      },
      params: {
        type: kind === 'image' ? 'image' : 'file'
      }
    })
    const readable = typeof response?.getReadableStream === 'function'
      ? response.getReadableStream()
      : response?.buffer
    const buffer = await readableToBuffer(readable, MAX_INBOUND_FILE_BYTES)
    if (!buffer.length) throw new Error('飞书附件为空')
    totalBytes += buffer.length
    if (totalBytes > MAX_INBOUND_TOTAL_BYTES) {
      throw new Error('单次消息附件总量超过 100MB 限制')
    }

    const contentType = normalizeHeaderValue(response?.headers, 'content-type')
      .split(';')[0]
      .trim()
    const headerName = filenameFromDisposition(
      normalizeHeaderValue(response?.headers, 'content-disposition')
    )
    const fallbackExtension = extensionForMimeType(contentType)
      || (kind === 'image' ? '.png' : '.bin')
    const requestedName = raw?.name
      || headerName
      || `${kind}-${index + 1}${fallbackExtension}`
    const destination = uniqueDestination(inboxDir, requestedName)
    fs.writeFileSync(destination, buffer, { flag: 'wx', mode: 0o600 })
    const name = path.basename(destination)
    accepted.push({
      kind,
      name,
      path: destination,
      mimeType: contentType || mimeTypeForName(name),
      size: buffer.length,
      sourceMessageId: messageId
    })
  }
  return accepted
}

function collectOutboxAttachments(workspace = {}) {
  const rejected = []
  const attachments = []
  let realOutbox
  try {
    realOutbox = resolveSafeOutbox(workspace).realOutbox
  } catch (error) {
    rejected.push({
      name: 'outbox',
      error: error?.message || String(error)
    })
    return { attachments, rejected }
  }

  let totalBytes = 0
  const visit = (directoryPath) => {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const target = path.join(directoryPath, entry.name)
      if (entry.isSymbolicLink()) {
        rejected.push({ name: entry.name, error: '不允许发送符号链接' })
        continue
      }
      if (entry.isDirectory()) {
        visit(target)
        continue
      }
      if (!entry.isFile()) continue
      if (attachments.length >= MAX_OUTPUT_FILES) {
        rejected.push({ name: entry.name, error: `单次最多发送 ${MAX_OUTPUT_FILES} 个附件` })
        continue
      }
      const realTarget = fs.realpathSync(target)
      if (!isPathInside(realOutbox, realTarget)) {
        rejected.push({ name: entry.name, error: '附件路径越过本轮 outbox' })
        continue
      }
      const stats = fs.statSync(realTarget)
      if (stats.size <= 0) {
        rejected.push({ name: entry.name, error: '空文件不能发送' })
        continue
      }
      if (stats.size > MAX_OUTPUT_FILE_BYTES) {
        rejected.push({ name: entry.name, error: '附件超过 30MB 限制' })
        continue
      }
      if (totalBytes + stats.size > MAX_OUTPUT_TOTAL_BYTES) {
        rejected.push({ name: entry.name, error: '本轮附件总量超过 100MB 限制' })
        continue
      }
      const name = sanitizeAttachmentName(entry.name)
      const mimeType = mimeTypeForName(name)
      attachments.push({
        kind: classifyAttachmentKind(name, mimeType),
        name,
        path: realTarget,
        mimeType,
        size: stats.size
      })
      totalBytes += stats.size
    }
  }
  visit(realOutbox)
  return { attachments, rejected }
}

function assertSafeOutputPath(workspace, filePath) {
  const { realOutbox } = resolveSafeOutbox(workspace)
  const stats = fs.lstatSync(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('只允许发送普通文件')
  const realTarget = fs.realpathSync(filePath)
  if (!isPathInside(realOutbox, realTarget)) {
    throw new Error('附件路径越过本轮 outbox')
  }
  return realTarget
}

function inferFeishuFileType(fileName = '') {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.doc', '.docx'].includes(ext)) return 'doc'
  if (['.xls', '.xlsx'].includes(ext)) return 'xls'
  if (['.ppt', '.pptx'].includes(ext)) return 'ppt'
  return 'stream'
}

async function sendFeishuMessage(apiClient, chatId, msgType, content) {
  const response = await apiClient.im.v1.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: msgType,
      content: JSON.stringify(content)
    }
  })
  if (response?.code && response.code !== 0) {
    throw new Error(response.msg || `飞书消息发送失败 (${response.code})`)
  }
  return response
}

async function sendFeishuOutputAttachment(apiClient, chatId, attachment, workspace) {
  if (!apiClient) throw new Error('飞书消息客户端未连接')
  const safePath = assertSafeOutputPath(workspace, attachment?.path)
  const fileName = sanitizeAttachmentName(attachment?.name || path.basename(safePath))
  const buffer = fs.readFileSync(safePath)

  if (attachment?.kind === 'image') {
    if (buffer.length > 10 * 1024 * 1024) throw new Error('飞书图片不能超过 10MB')
    const uploaded = await apiClient.im.v1.image.create({
      data: {
        image_type: 'message',
        image: buffer
      }
    })
    const imageKey = uploaded?.image_key || uploaded?.data?.image_key
    if (!imageKey) throw new Error('飞书图片上传未返回 image_key')
    return sendFeishuMessage(apiClient, chatId, 'image', { image_key: imageKey })
  }

  const uploaded = await apiClient.im.v1.file.create({
    data: {
      file_type: inferFeishuFileType(fileName),
      file_name: fileName,
      file: buffer
    }
  })
  const fileKey = uploaded?.file_key || uploaded?.data?.file_key
  if (!fileKey) throw new Error('飞书文件上传未返回 file_key')
  return sendFeishuMessage(apiClient, chatId, 'file', { file_key: fileKey })
}

module.exports = {
  ATTACHMENT_ROOT,
  MAX_INBOUND_FILE_BYTES,
  MAX_INBOUND_TOTAL_BYTES,
  MAX_OUTPUT_FILE_BYTES,
  MAX_OUTPUT_TOTAL_BYTES,
  MAX_OUTPUT_FILES,
  sanitizeAttachmentName,
  isPathInside,
  createAttachmentWorkspace,
  cleanupAttachmentWorkspace,
  pruneExpiredAttachmentWorkspaces,
  downloadFeishuAttachments,
  collectOutboxAttachments,
  classifyAttachmentKind,
  mimeTypeForName,
  sendFeishuOutputAttachment
}
