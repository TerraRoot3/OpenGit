import assert from 'node:assert/strict'
import managerModule from '../electron/tab-manager/web-tab-manager.js'

const { WebTabManager } = managerModule

class FakeWebContents {
  static nextId = 1

  constructor() {
    this.id = FakeWebContents.nextId++
    this.url = 'about:blank'
    this.loading = false
    this.closed = false
    this.reloaded = false
    this.listeners = new Map()
  }

  on(eventName, callback) {
    this.listeners.set(eventName, callback)
  }

  loadURL(url) {
    this.url = url
    return Promise.resolve()
  }

  getURL() {
    return this.url
  }

  isLoading() {
    return this.loading
  }

  canGoBack() {
    return false
  }

  canGoForward() {
    return false
  }

  close() {
    this.closed = true
  }

  reload() {
    this.reloaded = true
  }
}

class FakeWebContentsView {
  constructor() {
    this.webContents = new FakeWebContents()
    this.bounds = null
    this.autoResize = null
  }

  setBounds(bounds) {
    this.bounds = bounds
  }

  setAutoResize(value) {
    this.autoResize = value
  }
}

function createFakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send() {}
    },
    contentView: {
      children: [],
      addChildView(view) {
        if (!this.children.includes(view)) {
          this.children.push(view)
        }
      },
      removeChildView(view) {
        this.children = this.children.filter((item) => item !== view)
      }
    }
  }
}

const manager = new WebTabManager({
  ViewClass: FakeWebContentsView
})

manager.attachWindow(createFakeWindow())
manager.createWebTab('browser-web-1', 'https://example.com')

assert.equal(
  manager.activateWebTab('browser-web-1', { x: 0, y: 0, width: 1200, height: 800 }),
  true
)
assert.equal(manager.discardWebTab('browser-web-1'), true)

assert.equal(
  manager.activateWebTab('browser-web-1', { x: 0, y: 0, width: 1200, height: 800 }),
  true
)
assert.equal(manager.isActiveTab('browser-web-1'), true)

assert.equal(manager.discardWebTab('browser-web-1'), true)
assert.equal(manager.reloadWebTab('browser-web-1'), true)
assert.equal(manager.isActiveTab('browser-web-1'), true)

const recoveredView = manager._getView('browser-web-1')
assert.ok(recoveredView)
assert.equal(recoveredView.webContents.getURL(), 'https://example.com')
assert.equal(recoveredView.webContents.reloaded, true)

console.log('web-tab manager restore test passed')
