import assert from 'node:assert/strict'
import { createDownloadManagerState } from '../src/composables/downloadManagerState.mjs'

const downloads = createDownloadManagerState()

downloads.upsert({
  id: 'dl_1',
  state: 'started',
  fileName: 'archive.zip',
  totalBytes: 100,
  receivedBytes: 10
})
downloads.upsert({
  id: 'dl_1',
  state: 'progressing',
  receivedBytes: 60
})

assert.equal(downloads.list()[0].progress, 60)
assert.equal(downloads.list()[0].state, 'progressing')

console.log('download-manager state test passed')
